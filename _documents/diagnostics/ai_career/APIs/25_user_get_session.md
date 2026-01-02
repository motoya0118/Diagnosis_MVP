# 25. セッション取得 — GET /sessions/{session_code}

- 区分: User API（匿名可）
- 目的: セッションコードをキーに保存済み LLM 結果のみを取得し、診断結果画面の再表示や共有リンク復元に利用する。プロンプトやモデル情報などユーザーに不要な内部情報は含めない。

## エンドポイント
- Method: `GET`
- Path: `/sessions/{session_code}`
- Auth: 任意（セッションコードのみで参照可能）

## クエリパラメータ
なし

## レスポンス例
```json
{
  "version_id": 42,
  "outcomes": [
    {
      "outcome_id": 1001,
      "sort_order": 10,
      "meta": {
        "name": "AIエンジニア",
        "role_summary": "MLモデルの構築・運用を担う"
      }
    }
  ],
  "llm_result": {
    "raw": {
      "content": [
        {"text": "上位のおすすめは AIエンジニア..."}
      ]
    },
    "generated_at": "2024-09-19T02:10:00Z"
  }
}
```
- `llm_result` が未生成の場合は `null` を返す。
- `outcomes.meta` は `version_outcomes.outcome_meta_json` のスナップショットであり、存在しない場合は空オブジェクトになる。

### 返却ポリシー
- `llm_result` に含めるのはフロント表示に必要な整形済みデータのみ。
- `outcomes` は診断版に紐づく `version_outcomes` のメタ情報を順序付きで返し、値はコピーを返却する（呼び出し側で書き換えても DB には反映されない）。
- `model` や `messages`、システムプロンプトなどの内部情報はレスポンスから除外する。

## バリデーション
- `session_code` は URL パスで受け取り、英数字/ハイフン/アンダースコア（ULID 等）が前提。不正な形式でも 404 を返して挙動を秘匿する。

## DB アクセス
1. セッションを `session_code` で検索し、`version_id` と `llm_result` を取得する。
   ```sql
   SELECT version_id, llm_result
     FROM sessions
    WHERE session_code = :session_code;
   ```
2. `version_id` をキーに `version_outcomes` を取得し、`outcome_id`・`sort_order`・`outcome_meta_json` をソート順で並べる。
   ```sql
   SELECT outcome_id, sort_order, outcome_meta_json
     FROM version_outcomes
    WHERE version_id = :version_id
    ORDER BY sort_order, outcome_id;
   ```
3. `llm_result` は許可されたキー（`raw`, `generated_at` など）のみ残し、`outcome_meta_json` はディープコピーを返す。返却値の書き換えが DB に影響しないことを保証する。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E040_SESSION_NOT_FOUND` | セッションが存在しない / 期限切れ |

## テスト観点
- **正常取得**: `SessionFactory(session_code=...)` に `llm_result` を保存し、`GET /sessions/{code}` を実行。レスポンスに `version_id` と `outcomes` が含まれ、`outcomes.meta` の書き換えが DB に影響しないこと、`llm_result` に `model` や `messages` が含まれないことを確認。
- **未実行セッション**: `llm_result=NULL` のレコードで呼び、レスポンスの `llm_result` が `null` になることを検証。
- **存在しないコード**: 未登録の `session_code` でリクエストし、404 (`E040_SESSION_NOT_FOUND`) が返ることを確認。
- **共有リンク用途**: 匿名状態でリクエストし、認証不要でレスポンスが取得できることを確認（CORS 設定含む）。
