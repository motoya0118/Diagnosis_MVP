# 05. 診断版一覧取得 — GET /admin/diagnostics/{diagnostic_id}/versions

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 指定診断の Draft / Finalize 版を一覧表示し、操作対象を選択できるようにする。

## エンドポイント
- Method: `GET`
- Path: `/admin/diagnostics/{diagnostic_id}/versions`
- Auth: `Bearer JWT`

## パスパラメータ
- `diagnostic_id` *(number, required)*

## クエリパラメータ
- `status` *(string|null)* — `draft` / `finalized` を指定した場合、そのステータスのみ取得対象とする。未指定 (`null`) で全件。許容値以外は 400 (`E011_STATUS_INVALID`)。
- `limit` *(integer|null)* — ステータスごとの最新 n 件を取得（1〜100）。未指定時は 1000 件まで返す。範囲外は 400 (`E012_LIMIT_INVALID`)。

## レスポンス例
```json
{
  "diagnostic_id": 1,
  "items": [
    {
      "id": 37,
      "name": "v2024-08",
      "status": "finalized",
      "created_at": "2024-08-01T02:04:12Z",
      "updated_at": "2024-08-31T02:04:12Z",
      "discription": "試験版",
      "note": "メモ",
      "created_by_admin_id": 4,
      "updated_by_admin_id": 6,
      "system_prompt_state": "present",
      "is_active": True
    },
    {
      "id": 42,
      "name": "v2024-09-alpha",
      "status": "draft",
      "created_at": "2024-09-17T20:12:03Z",
      "updated_at": "2024-09-19T00:30:11Z",
      "discription": "アルファ版",
      "note": "メモ",
      "created_by_admin_id": 8,
      "updated_by_admin_id": 8,
      "system_prompt_state": "none",
      "is_active": False
    }
  ]
}
```
- `system_prompt_state`: `present` / `empty`（NULL）を返す。
- `is_active`: `cfg_active_versions.version_id == id` の場合に `true`。

## バリデーション
- `diagnostic_id` 未存在 → 404 (`E001_DIAGNOSTIC_NOT_FOUND`)。
- `status` が `draft` / `finalized` 以外 → 400 (`E011_STATUS_INVALID`)。
- `limit` が 1〜1000 以外 → 400 (`E012_LIMIT_INVALID`)。

## DB I/O
1. 診断存在確認（`SELECT 1 FROM diagnostics WHERE id=:diagnostic_id`）。
2. 版一覧取得
   ```sql
   SELECT dv.id,
          dv.diagnostic_id,
          dv.name,
          dv.description,
          dv.system_prompt,
          dv.note,
          dv.src_hash,
          dv.created_by_admin_id,
          dv.updated_by_admin_id,
          dv.created_at,
          dv.updated_at,
          CASE WHEN dv.system_prompt IS NULL THEN 'empty' ELSE 'present' END AS system_prompt_state,
          CASE WHEN dv.src_hash IS NULL THEN 'draft' ELSE 'finalized' END AS status,
          (cav.version_id IS NOT NULL) AS is_active
     FROM diagnostic_versions dv
  LEFT JOIN cfg_active_versions cav
       ON cav.diagnostic_id = dv.diagnostic_id
      AND cav.version_id = dv.id
    WHERE dv.diagnostic_id = :diagnostic_id
      AND (:status IS NULL OR (CASE WHEN dv.src_hash IS NULL THEN 'draft' ELSE 'finalized' END) = :status)
    ORDER BY CASE WHEN dv.src_hash IS NULL THEN 1 ELSE 0 END,
             dv.updated_at DESC,
             dv.id DESC
    LIMIT COALESCE(:limit, 1000);
   ```
- `system_prompt_state` はアプリ側で `NULL` 判定。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E001_DIAGNOSTIC_NOT_FOUND` | 診断ID不正 |
| 400 | `E011_STATUS_INVALID` | `status` が許容値以外 |
| 400 | `E012_LIMIT_INVALID` | `limit` が範囲外 |

## テスト観点
- **一覧取得（全件）**
  1. `DiagnosticVersionFactory` を用いて Draft 版2件、Finalize 版1件を作成し、`cfg_active_versions` には Finalize 版を設定する。
  2. `GET /admin/diagnostics/{id}/versions` を実行し、レスポンスの順序が `finalized` → `draft` の降順になっていること、Finalize 版のみ `is_active=true` であること、`system_prompt_state` が `present` / `empty` を正しく反映していることを確認。
- **ステータスフィルタ**
  1. 上記データを利用し、`?status=draft` で Draft のみ返ること、`?status=finalized` で Finalized のみ返ることを検証。
- **limit 検証**
  1. Draft 版を3件用意し、`?limit=1` で最新1件のみ返ることを確認。
- **診断未存在**
  1. 存在しない診断IDでアクセスし、404 (`E001_DIAGNOSTIC_NOT_FOUND`) が返ることを確認。
- **ステータス/limit バリデーション**
  1. `status=hoge` で 400 (`E011_STATUS_INVALID`) を期待。
  2. `limit=0` や `limit=9999` で 400 (`E012_LIMIT_INVALID`) を期待。
