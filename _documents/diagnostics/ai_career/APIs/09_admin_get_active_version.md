# 09. アクティブ版一覧 — GET /admin/diagnostics/active-versions

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 各診断の公開中バージョンを確認する。

## エンドポイント
- Method: `GET`
- Path: `/admin/diagnostics/active-versions`
- Auth: `Bearer JWT`

## クエリパラメータ
- `diagnostic_id` *(number|null)* — 指定診断のみ取得。
- `diagnostic_code` *(string|null)* — 診断コードで指定。`diagnostic_id` と併用不可。

## レスポンス例
```json
{
  "items": [
    {
      "diagnostic_id": 1,
      "diagnostic_code": "ai_career",
      "display_name": "ITキャリア診断",
      "active_version": {
        "version_id": 37,
        "name": "v2024-08",
        "src_hash": "4e7352...",
        "activated_at": "2024-08-31T15:00:00Z",
        "activated_by_admin_id": 4
      }
    },
    {
      "diagnostic_id": 2,
      "diagnostic_code": "legacy",
      "display_name": "旧診断",
      "active_version": null
    }
  ]
}
```
- `active_version` が `null` の場合、その診断は未公開状態。

## バリデーション
- `diagnostic_id` と `diagnostic_code` を同時に指定した場合は 400 (`E013_INVALID_FILTER`)。
- 指定条件で診断が 0 件の場合は 404 (`E001_DIAGNOSTIC_NOT_FOUND`)。

## DB I/O
```sql
SELECT d.id,
       d.code,
       d.description,
       cav.version_id,
       cav.updated_at AS activated_at,
       cav.updated_by_admin_id
  FROM diagnostics d
  LEFT JOIN cfg_active_versions cav ON cav.diagnostic_id = d.id
 WHERE (:diagnostic_id IS NULL OR d.id = :diagnostic_id)
   AND (:diagnostic_code IS NULL OR d.code = :diagnostic_code)
 ORDER BY d.code;
```
- 取得した `version_id` が存在する場合は `diagnostic_versions` を `IN` 句でまとめて取得し、`name`/`src_hash` をマッピングする。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 400 | `E013_INVALID_FILTER` | クエリの組み合わせが不正 |
| 404 | `E001_DIAGNOSTIC_NOT_FOUND` | 条件に合致する診断が存在しない |

## テスト観点
- **全件取得**
  1. アクティブ版ありの診断と無しの診断を用意し、`GET /admin/diagnostics/active-versions` で両方が返ることを確認。
- **診断ID指定**
  1. `?diagnostic_id=` で単一診断のみ返ることを検証。
- **診断コード指定**
  1. `?diagnostic_code=` で同様に単一診断が返ることを確認。
- **フィルタ併用/未存在**
  1. ID とコードを同時指定して 400 (`E013_INVALID_FILTER`) を期待。
  2. 存在しない診断を指定して 404 (`E001_DIAGNOSTIC_NOT_FOUND`) を確認。
