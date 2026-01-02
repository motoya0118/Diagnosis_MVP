# 10. 版詳細取得 — GET /admin/diagnostics/versions/{version_id}

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 版のメタ情報・行数サマリ・最新監査情報を閲覧する。

## エンドポイント
- Method: `GET`
- Path: `/admin/diagnostics/versions/{version_id}`
- Auth: `Bearer JWT`

## レスポンス例
```json
{
  "id": 42,
  "diagnostic_id": 1,
  "name": "v2024-09-alpha",
  "description": "2024年9月公開候補",
  "note": "初稿",
  "status": "draft",
  "system_prompt_preview": "You are an AI career advisor...",
  "src_hash": null,
  "created_by_admin_id": 8,
  "updated_by_admin_id": 8,
  "created_at": "2024-09-17T20:12:03Z",
  "updated_at": "2024-09-19T00:30:11Z",
  "summary": {
    "questions": 18,
    "options": 72,
    "outcomes": 12
  },
  "audit": {
    "last_imported_at": "2024-09-19T00:30:11Z",
    "last_imported_by_admin_id": 8,
    "finalized_at": null,
    "finalized_by_admin_id": null
  }
}
```
- `system_prompt_preview` は先頭 200 文字（末尾に `...`）。全文が必要な場合は `/system-prompt` API を利用する。
- `status`: `draft` / `finalized`。

## バリデーション
- 版が存在しない → 404 (`E010_VERSION_NOT_FOUND`)。

## DB I/O
1. `diagnostic_versions` 本体を取得。
2. `version_questions` / `version_options` / `version_outcomes` を `COUNT(*)`。
3. `aud_diagnostic_version_logs` から `action='IMPORT'` と `action='FINALIZE'` の最新行を取得。

### 取得例
```sql
SELECT dv.*
  FROM diagnostic_versions dv
 WHERE dv.id = :version_id;
```
```sql
SELECT
  (SELECT COUNT(*) FROM version_questions WHERE version_id = :version_id) AS questions,
  (SELECT COUNT(*) FROM version_options   WHERE version_id = :version_id) AS options,
  (SELECT COUNT(*) FROM version_outcomes  WHERE version_id = :version_id) AS outcomes;
```
```sql
SELECT action,
       admin_user_id,
       created_at
  FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY action ORDER BY created_at DESC, id DESC) AS rn
          FROM aud_diagnostic_version_logs
         WHERE version_id = :version_id
           AND action IN ('IMPORT', 'FINALIZE')
       ) x
 WHERE rn = 1;
```

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版未存在 |

## テスト観点
- **Draft 版**: `DiagnosticVersionFactory(src_hash=NULL)` を用意し、`GET` で `status='draft'`、`src_hash=null`、`summary` のカウントが実データ通りに返ることを確認。
- **Finalize 済み**: `src_hash` を設定した版と `aud_diagnostic_version_logs(action='FINALIZE')` を紐付け、レスポンスの `status='finalized'`、`audit.finalized_at` / `finalized_by_admin_id` がログ値を反映することを検証。
- **カウントゼロ**: 対象版の `version_questions` 等を空にして呼び出し、`summary` にゼロが返ることを確認。
- **監査ログなし**: `aud_diagnostic_version_logs` が存在しない状態で取得し、`audit` フィールドが `null` になることを確認。
- **版未存在**: 存在しない `version_id` を指定し、404 (`E010_VERSION_NOT_FOUND`) が返ることを確認。
