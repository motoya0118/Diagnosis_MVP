# 01. 診断一覧取得 — GET /admin/diagnostics

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 管理ダッシュボード用に診断メタ情報と最新版のサマリを返す。

## エンドポイント
- Method: `GET`
- Path: `/admin/diagnostics`
- Auth: `Bearer JWT`

## クエリパラメータ
- `include_inactive: bool` 任意（既定: `false`） — `diagnostics.is_active = 0` を含める場合に `true`。

## レスポンス例
```json
{
  "items": [
    {
      "id": 1,
      "code": "ai_career",
      "display_name": "ai_career",
      "description": "AI職種とのフィット診断",
      "outcome_table_name": "mst_ai_jobs",
      "is_active": true,
    },
    ...
  ]
}
```

## バリデーション
- `include_inactive` : `true|false` のみ許容。パースできない場合は 400 (`E011_STATUS_INVALID`)。
- 認証/認可エラーは 401/403。

## 備考
- `display_name` は `diagnostics.code` をそのまま返却する。フロントで別名表示が必要な場合は別途マスタを参照する。

## DB アクセス
1. 診断一覧
   ```sql
   SELECT d.id,
          d.code,
          d.description,
          d.outcome_table_name,
          d.is_active,
          d.created_at,
          d.updated_at
     FROM diagnostics d
    WHERE (:include_inactive OR d.is_active = 1)
    ORDER BY d.code;
   ```

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 401 | `E401_UNAUTHORIZED` | JWT 未付与/期限切れ |
| 403 | `E403_FORBIDDEN` | 管理者ロール以外 |
| 400 | `E011_STATUS_INVALID` | クエリ値が不正 |

## テスト観点
- **アクティブ診断のみ**: `DiagnosticFactory(is_active=True)` を2件、`DiagnosticFactory(is_active=False)` を1件作成。`GET /admin/diagnostics`（クエリ無し）を実行し、レスポンスの `items` に `is_active=false` の診断が含まれないことを検証。
- **非アクティブ含む**: 同じデータセットで `GET /admin/diagnostics?include_inactive=true` を実行し、3件すべてが返却されること、`is_active` フラグがレスポンスに反映されていることを確認。
- **権限エラー**: 非管理者トークンでアクセスし 403 (`E403_FORBIDDEN`) が返るか、未認証で 401 (`E401_UNAUTHORIZED`) になるかを確認。
