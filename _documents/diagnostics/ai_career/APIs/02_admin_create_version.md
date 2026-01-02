# 02. 診断版作成 — POST /admin/diagnostics/versions

- 区分: Admin API（認可必須・管理者ロール）
- 目的: `diagnostic_versions` に Draft 版を追加し、以降のスナップショット編集の起点を作る。

## エンドポイント
- Method: `POST`
- Path: `/admin/diagnostics/versions`
- Auth: `Bearer JWT`

## リクエストボディ
```json
{
  "diagnostic_id": 1,
  "name": "v2024-09-alpha",
  "description": "2024年9月公開候補",
  "system_prompt": null,
  "note": "初稿"
}
```
- `diagnostic_id` *(number, required)* — 対象診断の ID。
- `name` *(string, required, 1-128 chars)* — 版名。`diagnostic_id` 内で一意。
- `description` *(string|null)* — 版の説明。
- `system_prompt` *(string|null)* — 初期プロンプト。空で始める場合は `null`。
- `note` *(string|null)* — 運用メモ。

## レスポンス
- 201 Created
```json
{
  "id": 42,
  "diagnostic_id": 1,
  "name": "v2024-09-alpha",
  "description": "2024年9月公開候補",
  "system_prompt": null,
  "note": "初稿",
  "src_hash": null,
  "created_by_admin_id": 8,
  "updated_by_admin_id": 8,
  "created_at": "2024-09-17T20:12:03Z",
  "updated_at": "2024-09-17T20:12:03Z"
}
```

## バリデーション
- `diagnostic_id` が `diagnostics` に存在しない場合は 404 (`E001_DIAGNOSTIC_NOT_FOUND`)。
- `(diagnostic_id, name)` の組み合わせが既に存在する場合は 409 (`E002_VERSION_NAME_DUP`)。
- `name` はトリム後に空文字不可。128文字を超える場合は 400 (`E031_IMPORT_VALIDATION`)。

## DB I/O
```sql
INSERT INTO diagnostic_versions
  (diagnostic_id, name, description, system_prompt, note,
   created_by_admin_id, updated_by_admin_id, created_at, updated_at)
VALUES
  (:diagnostic_id, :name, :description, :system_prompt, :note,
   :admin_id, :admin_id, NOW(), NOW());
```
- 監査: `aud_diagnostic_version_logs` に `action='CREATE'` を1件追加（payloadに name/description を含める）。

```sql
INSERT INTO aud_diagnostic_version_logs
  (version_id, admin_user_id, action, new_value, note, created_at)
VALUES
  (:version_id, :admin_id, 'CREATE',
   JSON_OBJECT('name', :name, 'description', :description, 'system_prompt', :system_prompt, 'note', :note),
   NULL, NOW());
```
- トランザクション: INSERT + 監査ログの単一トランザクション。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E001_DIAGNOSTIC_NOT_FOUND` | `diagnostic_id` 未存在 |
| 409 | `E002_VERSION_NAME_DUP` | 同名版が存在 |
| 400 | `E031_IMPORT_VALIDATION` | name 長さやフォーマット不正 |

## テスト観点
- **正常作成**
  1. `DiagnosticFactory` で診断を1件用意し、認証済み管理者トークンで `POST /admin/diagnostics/versions` を呼び出す。
  2. ステータス 201、レスポンスに `id` が含まれ `src_hash=null` であることを確認。
  3. DB で `diagnostic_versions` にレコードが追加され、`aud_diagnostic_version_logs` に `action='CREATE'` が1件書き込まれていることを検証。
- **重複版名**
  1. 同一 `diagnostic_id` + `name` の Draft をあらかじめ作成 (`DiagnosticVersionFactory`)。
  2. 同じ `name` で POST すると 409 (`E002_VERSION_NAME_DUP`) が返り、`diagnostic_versions`/`aud_diagnostic_version_logs` に新規行が増えていないことを確認。
- **診断未存在**
  1. 存在しない `diagnostic_id` を指定して POST。
  2. 404 (`E001_DIAGNOSTIC_NOT_FOUND`) を受け取り、DB 挿入が行われていないことを確認。
