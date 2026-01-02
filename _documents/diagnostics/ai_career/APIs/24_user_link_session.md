# 24. セッション紐付け — POST /auth/link-session

- 区分: User API
- 目的: 匿名セッションを会員アカウントへ統合し、診断結果を保存および再利用できるようにする。

## コンセプト
- 会員登録済みかどうかに関係なく、`session_code` の紐付けはすべて `POST /auth/link-session` で扱う。
- フロントエンドはメール登録やログインに成功して JWT を取得した後、本エンドポイントを呼び出すだけでよい。既存の `/auth/register` のレスポンス仕様は変更しない。
- バックエンドは JWT で認証された `user_id` と `session_code` 群を照合し、矛盾がなければ `sessions.user_id` へ UPSERT（同一ユーザーなら更新／既に紐付いていれば何もしない）する。
- idempotent を前提とし、同じリクエストを複数回送っても結果が変わらないようにする。

## ユースケース
- **新規登録直後の同期**: `POST /auth/register` → JWT を受け取る → `POST /auth/link-session` で匿名セッションを自分のアカウントへ移行。
- **ログインユーザーの後追い保存**: 診断結果画面から「保存する」を押下して同エンドポイントを呼び、匿名で取得した結果をユーザーに紐付ける。
- **複数デバイス同期**: PC で実行した診断結果をモバイルのログイン済み状態で読み込む際、同じエンドポイントを利用してセッションを共有する。

## エンドポイント
- Method: `POST`
- Path: `/auth/link-session`
- Auth: `Bearer JWT`（ユーザーロール必須）

## リクエスト
```json
{
  "session_codes": [
    "8WQ4K9...",
    "F1P2S3..."
  ]
}
```

- `session_codes` は 1 件以上必須。最大 20 件まで受付。
- 同じ `session_code` が複数含まれている場合はユニーク化して処理する。

## レスポンス
- 200 OK
```json
{
  "linked": ["8WQ4K9..."],
  "already_linked": ["F1P2S3..."]
}
```

- `linked`: 今回のリクエストで `sessions.user_id` を更新できたコード。
- `already_linked`: 既に同じユーザーへ紐付いていたため変更不要だったコード。
- すべてのコードが `already_linked` でも 200 を返す（冪等）。

## バリデーション
- `session_codes` が配列でない／配列長が 0／上限を超える → 400 (`E020_INVALID_REQUEST` を再利用)。
- 各 `session_code` は英数字・ハイフン・アンダースコア（ULID 等）を想定。形式が異なる場合も 400 (`E020_INVALID_REQUEST`)。
- `sessions` に存在しないコードが含まれる → 404 (`E040_SESSION_NOT_FOUND`)。
- 他ユーザーへ既に紐付いているコードが含まれる → 409 (`E063_SESSION_OWNED_BY_OTHER`)。

## 処理フロー
1. JWT から `user_id` を取得し、トランザクションを開始。
2. リクエストの `session_codes` をユニーク化してロック付きで取得。
   ```sql
   SELECT session_code, user_id
     FROM sessions
    WHERE session_code = ANY(:session_codes)
    FOR UPDATE;
   ```
3. 取得件数が指定件数と一致しなければ 404 (`E040_SESSION_NOT_FOUND`)。
4. ロックしたレコードに対して
   - `user_id IS NULL` または `user_id = :current_user_id` → 更新対象。
   - 上記以外 → 409 (`E063_SESSION_OWNED_BY_OTHER`)。
5. 更新対象のみ UPSERT。`ended_at` が未設定なら現在時刻で埋め、`updated_at` を更新。
   ```sql
   UPDATE sessions
      SET user_id   = :current_user_id,
          ended_at  = COALESCE(ended_at, NOW()),
          updated_at = NOW()
    WHERE session_code = ANY(:linkable_codes)
      AND (user_id IS NULL OR user_id = :current_user_id);
   ```
   - 影響行数は `linked` 件数としてレスポンスに反映。
6. 200 レスポンスを返し、`linked` と `already_linked` を組み立てる。

- 実装によっては `INSERT ... ON CONFLICT (session_code) DO UPDATE` で `user_id` とタイムスタンプを UPSERT してもよい。ただし `WHERE sessions.user_id IS NULL OR sessions.user_id = :current_user_id` の条件は必ず付与する。

## エラーコード
| HTTP | Code | 説明 |
|------|------|------|
| 400 | `E020_INVALID_REQUEST` | リクエスト形式不正・件数超過 |
| 404 | `E040_SESSION_NOT_FOUND` | いずれかの `session_code` が存在しない |
| 409 | `E063_SESSION_OWNED_BY_OTHER` | 他ユーザーに紐付いたセッションが含まれる |

## テスト観点
- **新規登録直後の同期**: 匿名で作成したセッションに対し、新規ユーザーを発行して JWT を取得後、本 API を呼び `linked` 配列に対象コードが含まれることを確認。
- **冪等確認**: 同じコードで再度呼び出し、レスポンスが 200 で `already_linked` に移りデータが変わらないこと。
- **複数コード更新**: 2 件以上のコードをまとめて渡し、`linked` 件数が複数になることと、トランザクション内で一括更新されること。
- **他ユーザー所有**: 既に別ユーザーへ紐付いているコードを含めて呼び、409 (`E063_SESSION_OWNED_BY_OTHER`) が返り、トランザクションがロールバックされること。
- **存在しないコード**: 未登録コードを含めて呼び、404 (`E040_SESSION_NOT_FOUND`) が返ること。
