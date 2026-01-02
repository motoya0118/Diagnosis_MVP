# 08. アクティブ版切替 — POST /admin/diagnostics/versions/{version_id}/activate

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 指定版を `cfg_active_versions` に設定し、ユーザー向け公開版を切り替える。

## エンドポイント
- Method: `POST`
- Path: `/admin/diagnostics/versions/{version_id}/activate`
- Auth: `Bearer JWT`
- Body（任意）:
```json
{
  "diagnostic_id": 1
}
```
  - `diagnostic_id` を指定した場合、版が属する診断IDと一致するかを検証する。

## レスポンス
- 200 OK
```json
{
  "diagnostic_id": 1,
  "version_id": 37,
  "activated_at": "2024-09-19T01:05:00Z",
  "activated_by_admin_id": 8
}
```

## バリデーション
- 版が存在しない → 404 (`E010_VERSION_NOT_FOUND`)。
- 本文で指定した `diagnostic_id` と版が不一致 → 400 (`E012_DIAGNOSTIC_MISMATCH`)。
- Finalize 前（`src_hash IS NULL`）の版は公開不可 → 409 (`E030_DEP_MISSING`)。

## 処理手順（トランザクション内）
1. `diagnostic_versions` 行を `FOR UPDATE` で取得し、版情報を検証。
   ```sql
   SELECT id,
          diagnostic_id,
          src_hash
     FROM diagnostic_versions
    WHERE id = :version_id
    FOR UPDATE;
   ```
   - 行が取得できなければ 404 (`E010_VERSION_NOT_FOUND`)。
   - `src_hash IS NULL` なら Draft のままなので 409 (`E030_DEP_MISSING`)。
   - リクエストボディに `diagnostic_id` があれば、行の `diagnostic_id` と一致するか確認し、不一致なら 400 (`E012_DIAGNOSTIC_MISMATCH`)。
2. 現行の公開設定をロックし、旧版 ID を控える。
   ```sql
   SELECT version_id
     FROM cfg_active_versions
    WHERE diagnostic_id = :diagnostic_id
    FOR UPDATE;
   ```
   - 取得できた場合は旧版 ID として保持し、後続レスポンスや監査ログで利用する。
3. `cfg_active_versions` を更新し、対象版を公開版に設定。
   ```sql
   INSERT INTO cfg_active_versions
           (diagnostic_id, version_id, created_by_admin_id, updated_by_admin_id, created_at, updated_at)
   VALUES (:diagnostic_id, :version_id, :admin_id, :admin_id, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
           version_id = VALUES(version_id),
           updated_by_admin_id = VALUES(updated_by_admin_id),
           updated_at = NOW();
   ```
   - ステップ1で確定した `:diagnostic_id`、リクエスト引数の `:version_id`、実行管理者の `:admin_id` をバインドする。
   - 旧版が存在しない場合は INSERT、既存レコードがある場合は UPDATE として動作する。
4. `aud_diagnostic_version_logs` に `action='ACTIVATE'` を追加し、旧版と新板の差分を記録。
   ```sql
   INSERT INTO aud_diagnostic_version_logs
           (version_id, admin_user_id, action, new_value, note, created_at)
   VALUES (:version_id, :admin_id, 'ACTIVATE',
           JSON_OBJECT('diagnostic_id', :diagnostic_id,
                       'previous_version_id', :previous_version_id,
                       'activated_version_id', :version_id),
           IFNULL(:note, CONCAT('previous_version_id=', COALESCE(:previous_version_id, 'NULL'))),
           NOW());
   ```


### UPSERT SQL 例（MySQL 8.0）
```sql
INSERT INTO cfg_active_versions
        (diagnostic_id, version_id, created_by_admin_id, updated_by_admin_id, created_at, updated_at)
VALUES  (:diagnostic_id, :version_id, :admin_id, :admin_id, NOW(), NOW())
ON DUPLICATE KEY UPDATE
        version_id = VALUES(version_id),
        updated_by_admin_id = VALUES(updated_by_admin_id),
        updated_at = NOW();
```

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版未存在 |
| 400 | `E012_DIAGNOSTIC_MISMATCH` | Bodyの診断IDと不一致 |
| 409 | `E030_DEP_MISSING` | Finalize 前（`src_hash` が NULL） |

## テスト観点
- **アクティブ化成功**
  1. `DiagnosticVersionFactory(src_hash='hash')` で Finalize 済み版を作成し、`cfg_active_versions` を未設定にする。
  2. `POST /admin/diagnostics/{version_id}/activate` を実行し、200 が返ること、レスポンスの `activated_at` が更新され `cfg_active_versions` にレコードが作成されること、`aud_diagnostic_version_logs` に `ACTIVATE` が追加され `note` に旧版IDが記録されることを確認。
- **Draft 版エラー**
  1. `src_hash=NULL` の Draft 版で API を呼び出し、409 (`E030_DEP_MISSING`) が返り `cfg_active_versions` が更新されないことを確認。
- **診断ID不一致**
  1. Body に異なる `diagnostic_id` を指定し、400 (`E012_DIAGNOSTIC_MISMATCH`) が返ることを確認。
- **冪等性**
  1. 既にアクティブな版に対し再度 API を呼び出し、200 が返ること、`cfg_active_versions.version_id` が変わらず `updated_at` のみ更新されることを検証。
