# 23. LLM 実行 — POST /sessions/{session_code}/llm

- 区分: User API
- 目的: 回答済みセッションから USER/SYSTEM プロンプトを生成し、Amazon Bedrock の Claude モデルを呼び出して生の LLM 出力(JSON) を返す。

## エンドポイント
- Method: `POST`
- Path: `/sessions/{session_code}/llm`
- Auth: 任意（匿名セッションでも使用可能）
- Content-Type: `application/json`

## リクエストボディ
```json
{
  "model": "anthropic.claude-3-sonnet-20240229-v1:0",
  "temperature": 0.2,
  "top_p": 0.95,
  "force_regenerate": false
}
```
- `model` *(string|null)* — Amazon Bedrock で利用する Claude モデル名。未指定時はシステム既定値 (`anthropic.claude-3-sonnet-20240229-v1:0`)。※ 推論プロファイル経由の実行が必要な環境では、内部で対応する `inference-profile` ID に切り替えて呼び出します。
- `temperature` *(number|null)* — LLM の温度設定。`0.0〜1.0`、未指定は既定値。
- `top_p` *(number|null)* — nucleus sampling。`0.0〜1.0`、未指定は既定値。
- `force_regenerate` *(boolean|null)* — `true` の場合、既存 `sessions.llm_result` を無視して再実行する。

## レスポンス
### API
- 200 OK
```json
{
  "session_code": "8WQ4K9...",
  "version_id": 37,
  "model": "anthropic.claude-3-sonnet-20240229-v1:0",
  "messages": [
    { "role": "system", "content": "...system prompt..." },
    { "role": "user",   "content": "...llm_op で構成されたユーザープロンプト..." }
  ],
  "llm_result": {
    "raw": {"content": [...]} ,
    "generated_at": "2024-09-19T02:10:00Z"
  }
}
```
- `messages` は LLM 呼出に使用した完全なメッセージ列。
- `llm_result.raw` は Amazon Bedrock Chat Completions のレスポンスを透過返却（Claude の JSON 構造）。

### LLM(仮)
```json
{
  1:{
    "name": <outcome_table.name>,
    "total_match":{
      "score": <0~100 職種への総合マッチ度>,
      "reason": <スコアの根拠>,
    },
    "personality_match":{
      "score": <0~100 職種への性格マッチ度>,
      "reason": <スコアの根拠>
    },
    "work_match":{
      "score": <0~100 業務系、開発系の区分のマッチ度>,
      "reason": <スコアの根拠>
    }
  },
  2:{...},
  3:{...}
}
```

## バリデーション
- セッションが存在しない → 404 (`E040_SESSION_NOT_FOUND`)。
- セッションに回答が1件も無い → 400 (`E030_NO_ANSWERS`)。
- 対象版が Draft（`src_hash IS NULL`）→ 409 (`E020_VERSION_FROZEN`)。
- `version_options.llm_op` が欠落している回答が存在 → 400 (`E044_LLM_OP_INCOMPLETE`)。
- `diagnostic_versions.system_prompt` が空 → 400 (`E043_SYSTEM_PROMPT_MISSING`)。
- Bedrock API からエラー応答 → 502 (`E050_LLM_CALL_FAILED`)。

## 処理手順
1. `sessions` を `session_code` で取得し、`version_id` / `diagnostic_id` / `version_options_hash` / `llm_result` を確定。
   ```sql
   SELECT id AS session_id,
          version_id,
          diagnostic_id,
          user_id,
          version_options_hash,
          llm_result
     FROM sessions
    WHERE session_code = :session_code;
   ```
2. `force_regenerate=false` の場合、同一 `version_id` と `current_hash` を持つ既存 `sessions.llm_result` を検索し、結果が見つかれば再利用する（LLM 呼び出しをスキップ）。
   ```sql
   SELECT llm_result
     FROM sessions
    WHERE version_id = :version_id
      AND version_options_hash = :hash
      AND llm_result IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1;
   ```
3. `force_regenerate=false` かつステップ2で既存結果を取得できた場合は、その `llm_result` をレスポンスとして返却し、現在のセッションに `llm_result` が未保存であればコピーする。
   ```sql
   UPDATE sessions
      SET llm_result = :cached_result,
          ended_at   = COALESCE(ended_at, NOW()),
          updated_at = NOW()
    WHERE id = :session_id
      AND llm_result IS NULL;
   ```
4. ステップ2で既存結果を取得できない場合、`diagnostic_versions` から `system_prompt` と `src_hash` を取得。`src_hash` が `NULL` の場合は 409 を返す。
   ```sql
   SELECT diagnostic_id, system_prompt, src_hash
     FROM diagnostic_versions
    WHERE id = :version_id;
   ```
5. ステップ2で既存結果を取得できない場合、22番 API で保存された回答を取得し、`version_options.llm_op` を解決。`llm_op` が `NULL` の行があればエラー。
   ```sql
   SELECT vo.llm_op
     FROM answer_choices ac
     JOIN version_options vo ON vo.id = ac.version_option_id
    WHERE ac.session_id = :session_id
    ORDER BY ac.id;
   ```
6. ステップ2で既存結果を取得できない場合、LLM ユーザープロンプトを構築。`session.version_options_hash` が未設定の場合は回答集合から `sha256(','.join(sorted_ids))` を再計算し、後続で利用する。
   ```python
   hash_input = ','.join(str(opt.id) for opt in answered_options)
   current_hash = sha256(hash_input.encode('utf-8')).hexdigest()
   user_prompt = [entry.llm_op for entry in answered_options]
   ```
7. ステップ2で既存結果を取得できない場合、Bedrock (Claude) に送信するメッセージ列を生成。
   ```python
   messages = [
       {"role": "system", "content": system_prompt},
       {"role": "user", "content": json.dumps(user_prompt, ensure_ascii=False)}
   ]
   payload = {
        "modelId": request.model or DEFAULT_MODEL,
        "messages": messages,
        "inferenceConfig": {
            "temperature": request.temperature or DEFAULT_TEMP,
            "topP": request.top_p or DEFAULT_TOP_P
        },
        "responseFormat": {"type": "json"}
   }
   bedrock_response = bedrock_client.invoke_model(payload)
   ```
8. 新規に LLM を実行した場合、`sessions.llm_result` に保存し、必要に応じて `ended_at` を更新。
   ```sql
   UPDATE sessions
      SET llm_result = :bedrock_response_json,
          ended_at   = COALESCE(ended_at, NOW()),
          updated_at = NOW()
    WHERE id = :session_id;
   ```
9. レスポンスとして `messages` と `llm_result`（Bedrock 応答または再利用結果）を返却。

## 外部連携
- Amazon Bedrock Chat Completions API（Claude 系モデル）。
- タイムアウトは 30 秒、再試行は 1 回まで。失敗時は `E050_LLM_CALL_FAILED` を返す。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E040_SESSION_NOT_FOUND` | セッション未存在 |
| 409 | `E020_VERSION_FROZEN` | 版が Draft のため実行不可 |
| 400 | `E030_NO_ANSWERS` | 回答が 0 件 |
| 400 | `E043_SYSTEM_PROMPT_MISSING` | system_prompt が設定されていない |
| 400 | `E044_LLM_OP_INCOMPLETE` | `llm_op` が欠落している選択肢が存在 |
| 502 | `E050_LLM_CALL_FAILED` | Bedrock API からエラー応答 |

## テスト観点
- **正常実行**
  1. Draft ではない版に回答済みセッションを用意し、`POST /sessions/{code}/llm` を実行。
  2. レスポンスが 200 で `messages` が system/user 両方含まれ、Bedrock クライアント（スタブ）が呼び出されることを確認。
- **Draft 版エラー**
  1. `src_hash=NULL` の版で API を呼び、409 (`E020_VERSION_FROZEN`) が返ることを確認。
- **回答不足**
  1. `answer_choices` が 0 件のセッションで呼び、400 (`E030_NO_ANSWERS`) を検証。
- **llm_op 欠落**
  1. `version_options.llm_op=NULL` のデータを仕込み、400 (`E044_LLM_OP_INCOMPLETE`) が返ることを確認。
- **system_prompt 未設定**
  1. `system_prompt=NULL` の版で呼び、400 (`E043_SYSTEM_PROMPT_MISSING`) を確認。
- **Bedrock エラー**
  1. Bedrock クライアントをスタブしエラーレスポンスを返させ、502 (`E050_LLM_CALL_FAILED`) になることを検証。
- **force_regenerate**
  1. `sessions.llm_result` が存在する状態で `force_regenerate=false` と `true` を送信し、キャッシュ/再実行の挙動が切り替わることを確認。
- **既存結果再利用**
  1. 先に同じ回答集合で API を実行して `sessions.version_options_hash` と `llm_result` を保存。
  2. `force_regenerate=false` のまま再度同じ集合で API を呼び、Bedrock クライアントが呼ばれず、保存済み `llm_result` がレスポンスとして返ることを確認する。
