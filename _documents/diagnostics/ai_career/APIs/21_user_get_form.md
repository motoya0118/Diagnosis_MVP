# 21. フォーム取得 — GET /diagnostics/versions/{version_id}/form

- 区分: User API（匿名アクセス可）
- 目的: 指定版の設問・選択肢・Outcome 表示メタを取得し、フロントエンドでキャッシュする。

## エンドポイント
- Method: `GET`
- Path: `/diagnostics/versions/{version_id}/form`
- Auth: 任意
- Cache: `Cache-Control: public, max-age=86400, stale-while-revalidate=86400` を推奨。
- `ETag`: Finalize 済み版は `src_hash` を返し、`If-None-Match` と照合する（Draft 版は取得対象外）。

## レスポンス
- 200 OK
```json
{
  "version_id": 37,
  "questions": [
    {
      "id": 1201,
      "q_code": "experience",
      "display_text": "現在の職種を教えてください",
      "multi": false,
      "sort_order": 10,
      "is_active": true
    }
  ],
  "options": {
    "1201": [
      {
        "version_option_id": 9801,
        "opt_code": "engineer",
        "display_label": "エンジニア",
        "sort_order": 10,
        "is_active": true
      }
    ]
  },
  "option_lookup": {
    "9801": {
      "q_code": "experience",
      "opt_code": "engineer"
    }
  },
  "outcomes": [
    {
      "outcome_id": 5,
      "sort_order": 10,
      "meta": {
        "name": "機械学習エンジニア",
        "role_summary": "MLモデルの構築・運用を担う"
      }
    }
  ]
}
```

- Finalize 済み版のみ取得可能。Draft 版（`src_hash IS NULL`）を指定した場合は 404 を返す。
- `llm_op` は選択肢ごとに LLM への評価指示を保持する任意フィールド（`version_options.llm_op` を透過）。

## バリデーション
- `diagnostic_versions` に行が存在しない → 404 (`E010_VERSION_NOT_FOUND`)。
- Finalize 前（`src_hash IS NULL`）の版は 404 (`E020_VERSION_FROZEN`)。

## DB I/O
```sql
SELECT dv.id AS version_id,
       dv.src_hash,
       dv.updated_at,
       COALESCE((
         SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'id', vq.id,
                    'q_code', vq.q_code,
                    'display_text', vq.display_text,
                    'multi', vq.multi,
                    'sort_order', vq.sort_order,
                    'is_active', vq.is_active
                ) ORDER BY vq.sort_order, vq.id)
           FROM version_questions vq
          WHERE vq.version_id = dv.id
       ), JSON_ARRAY()) AS questions,
       COALESCE((
         SELECT JSON_OBJECTAGG(q_entry.version_question_id, q_entry.options_json)
           FROM (
                 SELECT vq.id AS version_question_id,
                        COALESCE((
                          SELECT JSON_ARRAYAGG(JSON_OBJECT(
                                     'version_option_id', vopt2.id,
                                     'opt_code',          vopt2.opt_code,
                                     'display_label',     vopt2.display_label,
                                     'sort_order',        vopt2.sort_order,
                                     'is_active',         vopt2.is_active
                                 ) ORDER BY vopt2.sort_order, vopt2.id)
                            FROM version_options vopt2
                           WHERE vopt2.version_id = dv.id
                             AND vopt2.version_question_id = vq.id
                        ), JSON_ARRAY()) AS options_json
                   FROM version_questions vq
                  WHERE vq.version_id = dv.id
                ) AS q_entry
       ), JSON_OBJECT()) AS options,
       COALESCE((
         SELECT JSON_OBJECTAGG(
                  vopt.id,
                  JSON_OBJECT('q_code', vq.q_code, 'opt_code', vopt.opt_code)
                )
           FROM version_options vopt
           JOIN version_questions vq
             ON vq.id = vopt.version_question_id
          WHERE vopt.version_id = dv.id
       ), JSON_OBJECT()) AS option_lookup,
       COALESCE((
         SELECT JSON_ARRAYAGG(JSON_OBJECT(
                    'outcome_id', vo.outcome_id,
                    'sort_order', vo.sort_order,
                    'meta',       vo.outcome_meta_json
                ) ORDER BY vo.sort_order, vo.outcome_id)
           FROM version_outcomes vo
          WHERE vo.version_id = dv.id
       ), JSON_ARRAY()) AS outcomes
  FROM diagnostic_versions dv
 WHERE dv.id = :version_id;
```
- Outcome メタは JSON のまま返却し、フロントで `meta` を展開して表示に利用する。

- アプリケーション側では、結果が 0 行の場合に `E010_VERSION_NOT_FOUND`、`src_hash` が `NULL` の場合に `E020_VERSION_FROZEN` を返す。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版が存在しない |
| 404 | `E020_VERSION_FROZEN` | Draft 版のため取得不可 |

## テスト観点
- **正常取得**
  1. `DiagnosticVersionFactory` と `VersionQuestionFactory` / `VersionOptionFactory` / `VersionOutcomeFactory` を用意し、`GET /diagnostics/versions/{id}/form` を呼び出す。
  2. レスポンスの `questions` / `options` / `outcomes` がソート順通りであり、`option_lookup` が `version_option_id` → `q_code` / `opt_code` を正しくマップしていることを確認。
- **ETag**
  1. Finalize 済み版で `src_hash` を持つケースを用意し、`If-None-Match` に同ハッシュを指定して 304 が返ることを検証。
- **Draft 版**
  1. `src_hash=NULL` の版で呼び出し、404 (`E020_VERSION_FROZEN`) が返ることを確認。
- **版未存在**
  1. 存在しない `version_id` を指定し、404 (`E010_VERSION_NOT_FOUND`) が返ることを確認。
- **空コレクション**
  1. `version_questions` や `version_outcomes` が空の版で呼び出し、レスポンスの `questions` / `outcomes` が `[]`、`options` / `option_lookup` が `{}` で返ることを検証。
