# 20. セッション開始 — POST /diagnostics/{diagnostic_code}/sessions

- 区分: User API（匿名利用可）
- 目的: 公開中の診断版でセッションを開始し、回答のための `session_code` を発行する。

## エンドポイント
- Method: `POST`
- Path: `/diagnostics/{diagnostic_code}/sessions`
- Auth: 任意（ログイン済みの場合は JWT を付与）
- Body: 空 JSON (`{}`) を受理。

## レスポンス
- 201 Created
```json
{
  "session_code": "8WQ4K9...",
  "diagnostic_id": 1,
  "version_id": 37,
  "started_at": "2024-09-19T02:02:15Z"
}
```
- ログイン中であれば内部的に `sessions.user_id` に紐付ける。

## バリデーション
- `diagnostics.code` が存在しない → 404 (`E001_DIAGNOSTIC_NOT_FOUND`)。
- アクティブ版が未設定（`cfg_active_versions` 行なし）→ 404 (`E010_VERSION_NOT_FOUND`)。
- `session_code` のユニーク制約に衝突した場合は再生成して再試行（アプリ側で最大3回）。

## 処理手順
1. `diagnostics` と `cfg_active_versions` を JOIN してアクティブ版の `version_id` を取得。
2. `ULID` などの URL セーフ文字列で `session_code` を生成。
3. `sessions(session_code, diagnostic_id, version_id, user_id, created_at, updated_at)` に INSERT。
4. 201 レスポンスを返却。

## SQL 例
```sql
SELECT d.id AS diagnostic_id,
       cav.version_id
  FROM diagnostics d
  JOIN cfg_active_versions cav ON cav.diagnostic_id = d.id
 WHERE d.code = :diagnostic_code;
```
```sql
INSERT INTO sessions
        (user_id, session_code, diagnostic_id, version_id, created_at, updated_at)
VALUES  (:user_id_nullable, :session_code, :diagnostic_id, :version_id, NOW(), NOW());
```

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E001_DIAGNOSTIC_NOT_FOUND` | 診断コードが存在しない |
| 404 | `E010_VERSION_NOT_FOUND` | アクティブ版が設定されていない |

## テスト観点
- **匿名セッション**: `cfg_active_versions` が設定された診断コードでリクエストを行い、201 が返り `sessions.user_id=NULL` でレコードが作成されることを確認。
- **ログインセッション**: 認証トークン付きで同APIを呼び、レスポンスが201、`sessions.user_id` にユーザーIDが保存されることを検証。
- **診断コード未存在**: 未登録コードでリクエストし、404 (`E001_DIAGNOSTIC_NOT_FOUND`) が返ることを確認。
- **アクティブ版未設定**: `cfg_active_versions` にレコードが無い診断でリクエストし、404 (`E010_VERSION_NOT_FOUND`) が返ることを確認。
- **session_code 衝突**: コード生成をモックして最初に既存コードを返すようにし、再生成でユニークコードが作成されること、最終的に201で成功することを検証。
