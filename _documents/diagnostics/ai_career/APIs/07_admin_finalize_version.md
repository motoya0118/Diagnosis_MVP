# 07. Finalize — POST /admin/diagnostics/versions/{version_id}/finalize

- 区分: Admin API（認可必須・管理者ロール）
- 目的: Draft 版のスナップショットを固定し、`src_hash` を確定させて参照APIに利用できる状態にする。

## エンドポイント
- Method: `POST`
- Path: `/admin/diagnostics/versions/{version_id}/finalize`
- Auth: `Bearer JWT`
- Body: なし

## レスポンス
- 200 OK
```json
{
  "version_id": 42,
  "src_hash": "4e7352e4a1...",
  "summary": {
    "questions": 18,
    "options": 72,
    "outcomes": 12
  },
  "finalized_at": "2024-09-19T01:00:00Z",
  "finalized_by_admin_id": 8
}
```

## バリデーション
- 版が存在しない → 404 (`E010_VERSION_NOT_FOUND`)。
- 既に `src_hash` が設定済み → 409 (`E020_VERSION_FROZEN`)。
- `version_questions` が 1 行以上存在すること。
- 各 `version_questions` に対し `version_options` が 1 行以上 (`is_active=1`) 存在すること。
- `version_outcomes` が 1 行以上存在すること。
- 条件を満たさない場合は 409 (`E030_DEP_MISSING`)。

## 処理手順（トランザクション内）
1. `diagnostic_versions` 行を `FOR UPDATE` で取得。
   ```sql
   SELECT id,
          diagnostic_id,
          src_hash,
          system_prompt
     FROM diagnostic_versions
    WHERE id = :version_id
    FOR UPDATE;
   ```
   - 行が取得できなければ 404 (`E010_VERSION_NOT_FOUND`)。
   - `src_hash IS NOT NULL` であれば 409 (`E020_VERSION_FROZEN`)。
2. 依存データの存在確認を実施し、不足があれば 409 (`E030_DEP_MISSING`)。
   ```sql
   SELECT COUNT(*) AS question_count
     FROM version_questions
    WHERE version_id = :version_id;

   SELECT q.id
     FROM version_questions q
     LEFT JOIN version_options o
       ON o.version_question_id = q.id
      AND o.is_active = 1
    WHERE q.version_id = :version_id
    GROUP BY q.id
    HAVING SUM(CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END) = 0
    LIMIT 1;

   SELECT COUNT(*) AS outcome_count
     FROM version_outcomes
    WHERE version_id = :version_id;
   ```
   - `question_count = 0` または `outcome_count = 0` の場合は Draft 不足。
   - 2 本目のクエリが行を返した場合も 409 を返却。
3. ハッシュ素材を構築し `src_hash` および件数サマリを算出。
   - 材料: `system_prompt`、`version_questions`（`sort_order` 昇順）、`version_options`（質問/選択肢ソート順）、`version_outcomes`（`sort_order`）。
   - 各集合を JSON 配列に変換（NULL は除外）、文字列化したものを `"\n"` で連結して `SHA2(..., 256)`。
   ```sql
   SELECT LOWER(HEX(SHA2(CONCAT_WS('\n',
            COALESCE(v.system_prompt, ''),
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'q_code', q_code,
                        'display_text', display_text,
                        'multi', multi,
                        'sort_order', sort_order,
                        'is_active', is_active
                    ) ORDER BY sort_order, id)
               FROM version_questions
              WHERE version_id = v.id),
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'q_code', q_code,
                        'opt_code', opt_code,
                        'display_label', display_label,
                        'llm_op', llm_op,
                        'sort_order', sort_order,
                        'is_active', is_active
                    ) ORDER BY version_question_id, sort_order, id)
               FROM version_options
              WHERE version_id = v.id),
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                        'outcome_id', outcome_id,
                        'sort_order', sort_order,
                        'meta', outcome_meta_json
                    ) ORDER BY sort_order, outcome_id)
               FROM version_outcomes
              WHERE version_id = v.id)
          ), 256))) AS src_hash,
          (SELECT COUNT(*) FROM version_questions WHERE version_id = v.id) AS question_count,
          (SELECT COUNT(*) FROM version_options WHERE version_id = v.id AND is_active = 1) AS option_count,
          (SELECT COUNT(*) FROM version_outcomes WHERE version_id = v.id) AS outcome_count
     FROM diagnostic_versions v
    WHERE v.id = :version_id;
   ```
4. `diagnostic_versions` を Finalize 状態に更新。
   ```sql
   UPDATE diagnostic_versions
      SET src_hash = :src_hash,
          finalized_at = NOW(),
          finalized_by_admin_id = :admin_id,
          updated_by_admin_id = :admin_id,
          updated_at = NOW()
    WHERE id = :version_id;
   ```
5. `aud_diagnostic_version_logs` に `action='FINALIZE'` を記録（`new_value` に `src_hash`・件数サマリを格納）。
   ```sql
   INSERT INTO aud_diagnostic_version_logs
           (version_id, admin_user_id, action, new_value, note, created_at)
   VALUES (:version_id, :admin_id, 'FINALIZE',
           JSON_OBJECT('src_hash', :src_hash,
                       'questions', :question_count,
                       'options', :option_count,
                       'outcomes', :outcome_count),
           NULL, NOW());
   ```

### ハッシュ算出サンプルSQL
```sql
SELECT LOWER(HEX(SHA2(CONCAT_WS('\n',
        COALESCE(v.system_prompt, ''),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'q_code', q_code,
                    'display_text', display_text,
                    'multi', multi,
                    'sort_order', sort_order,
                    'is_active', is_active
                ) ORDER BY sort_order, id)
           FROM version_questions
          WHERE version_id = v.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'q_code', q_code,
                    'opt_code', opt_code,
                    'display_label', display_label,
                    'llm_op', llm_op,
                    'sort_order', sort_order,
                    'is_active', is_active
                ) ORDER BY version_question_id, sort_order, id)
           FROM version_options
          WHERE version_id = v.id),
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'outcome_id', outcome_id,
                    'sort_order', sort_order,
                    'meta', outcome_meta_json
                ) ORDER BY sort_order, outcome_id)
           FROM version_outcomes
          WHERE version_id = v.id)
    ), 256))) AS src_hash;
```
## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版未存在 |
| 409 | `E020_VERSION_FROZEN` | 既に Finalize 済み |
| 409 | `E030_DEP_MISSING` | 質問/選択肢/Outcome が不足 |

## テスト観点
- **正常Finalize**
  1. `DiagnosticVersionFactory(src_hash=NULL)` で Draft 版を作成し、`VersionQuestionFactory` / `VersionOptionFactory` / `VersionOutcomeFactory` を最低1件ずつ紐付ける。
  2. `PUT /admin/diagnostics/{version_id}/system-prompt` などでプロンプトを設定しておく。
  3. `POST /admin/diagnostics/{version_id}/finalize` を実行し、200 が返ること、レスポンスの `src_hash` が設定され `summary` の件数が実データと一致することを確認。
  4. DB で `diagnostic_versions.src_hash` が更新され、`aud_diagnostic_version_logs` に `action='FINALIZE'` のレコードが追加されていることを検証。
- **質問不足エラー**
  1. Draft 版を作成し `version_questions` を空にして API を呼び出し、409 (`E030_DEP_MISSING`) が返ることを確認。
  2. 同様に `version_options` や `version_outcomes` を欠落させても 409 になることを検証。
- **すでにFinalize済み**
  1. `src_hash` が設定された版で API を呼び出し、409 (`E020_VERSION_FROZEN`) が返り、`src_hash` が変化しないことを確認。
- **ハッシュ素材差分**
  1. Draft 版 A を Finalize し、レスポンスと DB に記録された `src_hash`・集計件数を控える。
  2. 同じ設問構成を複製して Draft 版 B を作成し、一部の `system_prompt` や `version_options` を変更する。
  3. Draft 版 B を Finalize すると新しい `src_hash` になること、`src_hash`が異なること、両版それぞれに `FINALIZE` ログが残ることを確認。
