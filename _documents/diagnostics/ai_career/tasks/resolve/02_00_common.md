# 00. 共通整備

## タスクチェックリスト
- [x] 規約を読む
- [x] 対象の設計書を読む
- [x] テストコードを作る(TDD)
- [x] テストコードを修正しつつ実装する(TDD)
- [x] 最後にテストがオールグリーンになることを確認する(TDD)
- [x] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [x] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 規約
- `_documents/common/backend/implementation_guidelines.md`
- `_documents/common/frontend/implementation_guidelines.md`

## 参照
- `_documents/diagnostics/ai_career/APIs/00_common.md`
- `_documents/diagnostics/ai_career/DB設計.md` — 認証/監査で利用する全テーブルの定義
- `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` 共通トースト/認証まわりの期待値
- `_documents/diagnostics/ai_career/front/03_共通診断画面.md` セッション管理共有ロジック

## バックエンド
- `version_options_hash` 算出ユーティリティ（ソート→`sha256`）と、`outcome_table_name`→モデル解決レジストリを `registry.py` に実装。
- 監査ログ (`aud_diagnostic_version_logs`) の共通書き込みヘルパを用意し、`action`/`note` の組み立てを一元化。

## フロントエンド
- 共通トースト・ローディング・エラーハンドリングの仕組みを整備し、ダッシュボード/診断画面の仕様に沿った UX を実現。
  - `app/providers/feedback_provider.tsx` に `ToastContext` と `LoadingOverlayContext` を定義し、`App` 直下に `ToastViewport`（スナックバー）と `GlobalLoadingBackdrop`（画面全体スピナー）を常駐させる。各画面は `useToast()` / `useLoading()` から成功・警告・エラートーストやロード状態を発火できるようにする。
  - API 呼び出しラッパーを `lib/http/fetcher.ts` にまとめ、`fetcher` 内で HTTP ステータスと `error_code` を解決して `mapApiErrorToMessage()` を返却。`401/403` は `auth/redirectToLogin()`、`404` は画面固有ハンドラ、それ以外は `useToast().error()` で通知する。再試行が可能な場合は `Retry` アクション付きトーストにする。
  - ボタン単位のローディングは `withActionLoading(fn, scopeKey)` ヘルパーで包み、`scopeKey` ごとに同時実行をブロック。ダッシュボードの DL/インポート、診断画面の回答送信はこのヘルパー経由で実装し、ボタンの `loading` プロップに連動させる。
  - 非同期例外（ネットワーク断・ストレージ不可）は `ErrorBoundary`＋`ErrorStateCard` にフォールバックし、モーダルやトーストと重複しないレイヤで再試行 UI を提供。診断画面ではストレージ書き込みエラー時にバナー表示へ切り替える。
  - 成功トーストの文言やバリアント（成功/警告/情報）は `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` で定義されたアクションごとに再利用し、UI のトーン&マナーを統一する。
- 共通診断ステート（`diagnostic_code`, `session_code`, `status`, `version_id` 等）を読み書きするユーティリティを hooks として切り出す。
  - ステートスキーマ: `diagnostic_code`, `version_id`, `session_code`, `status` (`in_progress` | `completed` | `expired`), `choices` (`Record<qCode, number[]>`), `llm_result`, `llm_messages`, `completed_at`, `expires_at`, `version_options_hash`。ローカルストレージキーは `diagnostic_session:${diagnostic_code}` とし、セッションが変わった場合は初期化する。
  - `useDiagnosticSessionState()` は React context でステートを公開し、初期化時にストレージから読み込み→API (`20_user_start_session`/`21_user_get_form`) で不足分を補完する。ストレージが利用できない場合はメモリバックアップへフォールバックし、利用不可トーストを表示する。
  - 更新操作は `useDiagnosticSessionActions()` で提供し、`upsertChoice(qCode, optionIds)`, `removeChoice(qCode)`, `markCompleted(llmResult)`, `resetSession()` などを揃える。内部では immer で不変更新し、`useEffect` でストレージへ同期する。
  - hooks は `useDiagnosticFormNavigation()`（現在の質問インデックス/進捗バー計算）や `useSubmitAnswers()`（送信 API 連携＋トースト表示）など下位機能でも再利用する。これにより診断画面の UI コンポーネントはシンプルに props 連携だけで共通ステートを扱える。
  - Storybook では `DiagnosticSessionProvider` のモックを用意し、`in_progress` / `completed` / `expired` の各パターンを切り替えて挙動を確認する。

## テスト/検証
- FactoryBoy 等で各テーブルの Factory を用意し、後続 API テストが依存できるようにする。
- JWT ミドルウェア、エラーハンドリング、`version_options_hash` の単体テストを作成。
- Front 側はフェッチラッパと診断ステート hooks の単体テスト/Storybook を整備し、共通フローを検証。
