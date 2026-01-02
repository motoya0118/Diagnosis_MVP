# 共通機能早見表（フロントエンド）

管理画面／診断フロント共通で利用される基盤コンポーネント・ユーティリティの所在地と利用方法を整理します。新規メンバーはここから関連コードに辿ってください。共通処理を追加した際は本ドキュメントも更新します。

---

## 1. エラーコード管理

- **定義元**: `frontend/error_codes.yaml`（利用者向け UI 文言）、`admin_front/error_codes.yaml`（管理画面向け）。運用ルールは `_documents/common/error_code_manage.md` を参照。
- **生成スクリプト**:
  - フロント: `npm run generate:error-codes` → `scripts/generateErrorCodes.ts` が `lib/error-codes.ts` を自動生成。
  - 管理画面: 同コマンドで `admin_front/lib/error-codes.ts` を生成。
- **利用方法**:
  - `lib/error-codes.ts` provides `getErrorDefinition`, `requireErrorDefinition`, `isErrorWithCode`, `resolveUiError` などのヘルパーを公開。
  - API レイヤーや UI でエラー表示が必要な場合はここから取得する。

---

## 2. HTTP クライアント共通処理

- **Axios ベースのバックエンドクライアント**: `frontend/lib/backend.ts`
  - `loginWithCredentials` / `register` / `exchangeGithub` / `refreshToken` / `logout` を提供し、ブラウザでは `ensureDeviceId()` により `X-Device-Id` を自動付与。
  - エラー応答に `error.code` が含まれていれば `ApiErrorWithCode` として `errorCode` 情報を付与。
  - `extractErrorCode(error)` で axios エラーから `ErrorCodeDefinition` を抽出可能。
- **共通 fetch ラッパー**: `frontend/lib/http/fetcher.ts`
  - SSR/CSR 両対応で API ベース URL を判定し、JSON Body の自動シリアライズ・`X-Device-Id` 設定を実施。
  - 失敗時は `ApiError` をスロー。401/403 は `redirectToLogin()` を経由してサインイン画面へ誘導。
  - `mapApiErrorToMessage(status, code)`（`frontend/lib/http/error-mapping.ts`）でステータスごとの UI 表示（Variant/メッセージ/アクション）を決定。エラーコード追加時は `FALLBACK_STATUS_CODES` の更新も検討。
- **管理画面用 fetch**: `admin_front/lib/apiClient.ts`  
  `adminFetch` が `Response` を返しつつ、失敗時には `AdminApiError(code, definition)` を投げる。UI 側は `resolveAdminError()` で表示文言を取得する。

---

## 3. デバイス識別子の扱い

- `frontend/lib/device-id.ts`
  - `ensureDeviceId()` はブラウザの `localStorage` に UUID を保存し、Cookie 同期も行う。`NEXT_PUBLIC_DEVICE_ID_COOKIE_MAX_AGE` で Cookie の寿命を制御（デフォルト 1 年）。
  - `readDeviceId()` は保持済み ID を取得。SSR では `undefined` を返す。
  - fetcher / axios クライアントが自動で利用するため、呼び出し側は基本的に意識不要。

---

## 4. NextAuth 設定（管理者・診断共通）

- `frontend/lib/auth/options.ts`
  - `authOptions` が NextAuth サーバー構成の単一ソース。認証手段（メール+パスワード／GitHub）、セッション更新、Remember me（refresh token を維持）を共通実装。
  - `loginWithCredentials` / `exchangeGithub` / `refreshToken` を内部で呼び出し、バックエンド API とやり取りする。
  - `redirectToLogin(nextPath)`（`frontend/lib/auth/redirectToLogin.ts`）でクライアント遷移を統一。未認証時の遷移パターンはここを利用。

---

## 5. 診断セッション管理（状態保持）

- パッケージ: `frontend/features/diagnostics/session/`
  - `context.tsx`: `DiagnosticSessionProvider` がローカルストレージ可否を判定し、回答途中の状態を `DiagnosticSessionState` 型で保持。`useDiagnosticSessionState` / `useDiagnosticSessionActions` を提供。
  - `storage.ts`: ローカルストレージ利用が不可な環境でもメモリ Map にフォールバック。`persistSessionSnapshot` が保存戦略を吸収する。
  - `types.ts`: セッション状態の型定義。設計書 `_documents/diagnostics/ai_career/APIs/21_user_get_form.md` 等と整合。
  - hooks を組み合わせるタスクではこの provider をラップし、API 同期ロジックを追加する。
- 共通診断 QA 画面
  - `frontend/features/diagnostics/commonQa/` にセッション初期化・フォーム取得・バリデーションをまとめたユーティリティを配置。
    - `api.ts`: `startDiagnosticSession` / `fetchDiagnosticForm` で `20_user_start_session` / `21_user_get_form` をラップ。`ETag` を付与して 304 Not Modified を考慮した取得が可能。
    - `sessionLifecycle.ts`: `reconcileSessionState` でローカルストレージの既存状態と新規セッションレスポンスを突き合わせ、版変更時は自動でクリア。
    - `validation.ts`: `findUnansweredQuestions` 等、UI で流用する共通ロジックを集約。
  - 画面側では `DiagnosticSessionProvider` に包んだ上でこれらの関数を呼び出し、進捗バーやナビゲーションの状態を組み立てる。

---

## 6. UI フィードバックの共通基盤

- `frontend/app/providers/feedback_provider.tsx`
  - `FeedbackProvider` がトースト表示とロード中オーバーレイを一括管理。`useToast()` / `useLoading()` で variant 別の通知やスコープ単位のローディング制御が可能。
  - 自動クローズのデフォルト時間は `NEXT_PUBLIC_FEEDBACK_AUTO_DISMISS_MS` で調整。
  - グローバルで一度だけラップし、各ページ・feature でコンテキスト関数を呼び出す。

---

## 7. マスターデータのフォールバック

- `frontend/lib/data/staticMasters.ts`
  - `STATIC_MASTERS` に `mst_ai_jobs` など最低限のスキーマ・空配列を定義。SSR 初期描画でマスターデータ取得に失敗した場合のプレースホルダーとして利用する。
  - 本番は `GET /master/{key}` のレスポンス（`schema` / `rows` / `etag`）と一致する形で扱う。

---

## 8. 利用時チェックリスト

1. API との通信を追加 → 既存の `fetcher` または `lib/backend.ts` の関数で賄えないか確認し、共通化できる場合は同ファイルに追記。
2. エラー表示を行う → `ErrorCodeDefinition` を通じて一貫したメッセージを表示。新しいコードを追加した場合は YAML → スクリプト再実行を忘れない。
3. 診断セッションを扱う → Provider / storage ヘルパーを再利用し、`DiagnosticSessionState` との互換性を保つ。
4. トーストやロード中 UI が必要 → `useToast` / `useLoading` を使用し独自実装を避ける。

共通モジュールを新設した際は、責務・利用例・関連環境変数（あれば）を本書に追記してください。

---

## 9. 管理ダッシュボード共通コンポーネント

- `admin_front/components/ImportStructureCard.tsx`
  - 管理ダッシュボードでの版構成インポート UI。ドラッグ&ドロップとファイル選択をサポートし、`AdminApiError` からセル座標付きの詳細を抽出して表示する。
  - 取り込み成功時はレスポンスの件数と警告をカード内に表示し、`onImportSuccess` で親側の再ロード処理（例: `reloadVersions()`）を呼び出せる。
