# 06. システムプロンプト更新 — PUT /admin/diagnostics/versions/{version_id}/system-prompt

- 区分: Admin API（認可必須・管理者ロール）
- 目的: Draft 版の `diagnostic_versions.system_prompt` を更新し、LLM 呼び出し時に利用するプロンプトを差し替える。

## エンドポイント
- Method: `PUT`
- Path: `/admin/diagnostics/versions/{version_id}/system-prompt`
- Auth: `Bearer JWT`
- Content-Type: `application/json`

## リクエストボディ
```json
{
  "system_prompt": "You are an AI career advisor...",
  "note": "2024-09 prompt refresh"
}
```
- `system_prompt` *(string|null)* — 空文字は `null` として保存。10万文字を上限。
- `note` *(string|null)* — 変更理由。監査ログの `note` に格納。

## レスポンス
- 200 OK
```json
{
  "id": 42,
  "system_prompt": "You are an AI career advisor...",
  "updated_at": "2024-09-19T03:34:56Z",
  "updated_by_admin_id": 8
}
```

## バリデーション
- 版が存在しない → 404 (`E010_VERSION_NOT_FOUND`)。
- Finalize 済み (`src_hash IS NOT NULL`) → 409 (`E020_VERSION_FROZEN`)。
- `system_prompt` の長さが上限超え → 400 (`E031_IMPORT_VALIDATION`)。

## DB I/O
```sql
UPDATE diagnostic_versions
   SET system_prompt = :system_prompt,
       note = COALESCE(:note, note),
       updated_by_admin_id = :admin_id,
       updated_at = NOW()
 WHERE id = :version_id
   AND src_hash IS NULL;

INSERT INTO aud_diagnostic_version_logs
       (version_id, admin_user_id, action, new_value, note, created_at)
VALUES (:version_id, :admin_id, 'PROMPT_UPDATE',
        JSON_OBJECT('system_prompt_sha256', SHA2(COALESCE(:system_prompt, ''), 256)),
        :note, NOW());
```
- 監査の `new_value` には `system_prompt` の SHA256 を記録し、`note` はリクエストから引き継ぐ。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版未存在 |
| 409 | `E020_VERSION_FROZEN` | Finalize 済み |
| 400 | `E031_IMPORT_VALIDATION` | 入力長さが上限超え |

## テスト観点
- **Draft 版更新**
  1. `DiagnosticVersionFactory(src_hash=NULL)` で Draft 版を作成。
  2. `PUT /admin/diagnostics/{version}/system-prompt` に `system_prompt="foo"` を送信し、200 が返ること、レスポンスの `updated_at` が更新され `system_prompt` が `foo` になることを確認。
  3. DB で `diagnostic_versions.system_prompt='foo'`、`aud_diagnostic_version_logs` に `action='PROMPT_UPDATE'` の行が1件追加され、`new_value.system_prompt_sha256` が `foo` のハッシュと一致していることを検証。
- **Finalize 版拒否**
  1. `DiagnosticVersionFactory(src_hash='hash')` で Finalize 済み版を作成。
  2. 同 API を呼び出し 409 (`E020_VERSION_FROZEN`) が返り、`diagnostic_versions` に変更が無いことを確認。
- **空文字→NULL**
  1. Draft 版に対し `system_prompt=""` を送信し、レスポンスで `system_prompt=null` となることを確認。
- **長さバリデーション**
  1. 10 万文字を超える文字列を送信し、400 (`E031_IMPORT_VALIDATION`) が返ることを確認。
