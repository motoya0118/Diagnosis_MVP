# 12-1 admin_front NextAuth 導入（JWT 認証リニューアル）

## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [x] 修正方針を理解する
- [x] 既存のセッション管理 (`admin_front/lib/adminSession.ts`, `localStorage` ベース) とログイン画面 (`admin_front/app/page.tsx`) の挙動を整理し、NextAuth 移行後に必要となるデータフローを `_documents/diagnostics/ai_career/運用・データフロー設計.md` と `frontend/lib/auth/options.ts` を参考に設計する。
- [x] `admin_front/package.json` に `next-auth` を依存追加し、`.env` 系設定（`NEXTAUTH_URL`, `NEXTAUTH_SECRET`, 管理画面用バックエンド API URL）を `admin_front/env-sample` に追記する。
- [x] `admin_front/lib/auth/options.ts`（新規）を作成し、`CredentialsProvider` を用いて `backend/app/routers/admin_auth.py` の `/login`・`/refresh` をコールする。JWT コールバックでバックエンドの `access_token` と有効期限を保持し、`getServerSession`/`getToken` で取り出せるようにする。
- [x] `admin_front/app/api/auth/[...nextauth]/route.ts` を追加し、上記 `authOptions` を `NextAuth` に渡して API ルートを構成する。`frontend/app/api/auth/[...nextauth]/route.ts` と構成を比較しながら管理画面用に最小限にする。
- [x] `admin_front/app/layout.tsx` に `SessionProvider` を組み込み、クライアントコンポーネントから `useSession` が利用できるようにする。`admin_front/components/AdminHeader.tsx`（Issue 12_1_01）やフォーム類からのログアウト検知を NextAuth ベースに置き換える。
- [x] `admin_front/app/page.tsx`（ログイン画面）を NextAuth の `signIn("credentials")` を使った実装に差し替え、`admin_front/lib/adminSession.ts` は不要になったロジックを削除する。エラー表示は `signIn` の戻り値でハンドリングする。
- [x] `admin_front/lib/apiClient.ts` を更新し、NextAuth のセッショントークン（Backend JWT）を自動で `Authorization: Bearer` に付与するヘルパーを提供する。サーバーコンポーネントとクライアントフックの両方から簡単に利用できる API を整備する。
- [x] テスト（`admin_front/tests/hooks/*.test.tsx`, `admin_front/tests/lib/templateDownloader.test.ts` 等）を NextAuth ベースのセッション構造に合わせてモックを書き換える。`next-auth/react` のモックは `vi.mock("next-auth/react", ...)` で差し替える。

## 修正方針
- `admin_front/lib/adminSession.ts`: NextAuth 導入後は不要になるため、`getBackendAccessToken(session)` 完全削除する。既存フック（`admin_front/hooks/useDiagnostics.ts` など）が参照する箇所を総点検する。
- `admin_front/app/page.tsx`: フォーム送信時に `signIn("credentials", { redirect: false, userId, password })` を呼び、レスポンスの `error`/`ok` に応じて `_documents/diagnostics/ai_career/APIs/01_admin_get_diagnostics.md` に記載のエラーコードを解決する。成功時は `router.push("/dashboard")`。
- `admin_front/lib/auth/options.ts`: `CredentialsProvider` の `authorize` 内で `fetch(`${API_BASE}/admin_auth/login`)` を呼び、成功時は `return { id: adminId, token, expiresAt }` の形で NextAuth `user`/`token` に保持する。`jwt`/`session` コールバックで `refresh` 呼び出しを実装し、期限切れ時に `/admin_auth/refresh` を利用する。
- `admin_front/lib/apiClient.ts`: `adminFetchWithAuth` のような関数を追加し、内部で `getToken()` から取得した JWT を `Authorization` ヘッダにセットする。既存の `adminFetch` は呼び出し側がヘッダを指定する前提なので破壊的変更とする。
- `admin_front/tests`: NextAuth をモックするため共通のヘルパー（例: `admin_front/tests/test-utils/mockSession.ts`）を作成し、`useDiagnostics` などのフックテストが `token` を props で受け取らずとも動作する形に書き換える。
- `_documents/notion/diagnostics/02_common_handover.md`: 認証方式の更新点（NextAuth 導入・セッションの扱い方）を開発メモとして追記する。
