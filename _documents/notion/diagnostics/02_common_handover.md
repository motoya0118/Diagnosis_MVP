# 02_00_common 引継ぎメモ

- `DiagnosticSessionProvider` は `frontend/app/(public)/diagnostics/common_qa/CommonQaScreen.tsx` から `startDiagnosticSession` / `fetchDiagnosticForm` を呼び出す形で連携済み。新しい診断画面を追加する際は `features/diagnostics/commonQa/` の API ラッパーと `reconcileSessionState` を流用する。
- `useDiagnosticFormNavigation` / `useSubmitAnswers` など下位 hooks は未実装。画面タスク側で共通ステートの操作関数を組み合わせて拡張する前提。
- `fetchDiagnosticForm` は `ETag` ベースで 304 を扱うようにしているため、フォーム定義を更新したら invalidate される。別画面でも同キャッシュを流用する場合は `features/diagnostics/commonQa/api.ts` の `Map` キャッシュを参照。
- トースト文言はベースのみ定義しているため、ダッシュボード側の具体的な成功パターン（import 完了など）に合わせて `ToastContext` ラッパーを整備予定。
- backend の `OutcomeModelBinding` は `mst_ai_jobs` のみを登録済み。追加診断導入時は新しい outcome モデルをレジストリに追記すること。
- 版構成インポートは `StructureImporter` に集約した。新規 outcome テーブルを導入する際は `OutcomeModelBinding.key_columns` を必ず登録し、Excel テンプレートの列構成と同期を取ること。
- version_options は question_id を廃止し、version_questions の主キーを参照する `version_question_id` を持つ。バックエンド／フロントの JOIN は version_questions 経由で行う実装に統一しているため、新規処理でも question_id ではなく version_question_id を介して紐付けること。
- 管理画面の `SystemPromptCard` は `GET/PUT /admin/diagnostics/versions/{id}/system-prompt` を直接叩く。現状レスポンスには管理者名が含まれないため、`updated_by_admin_id` を表示している。今後のタスクで管理者プロフィール API を持たせる場合はここを差し替える想定。
- 管理フロントの認証は NextAuth (Credentials Provider) に移行済み。JWT は NextAuth のセッション (`useSession`) 経由で取得し、`adminFetchWithAuth` が `Authorization` ヘッダを自動付与する。`.env` には `ADMIN_BACKEND_URL` / `NEXTAUTH_URL` / `NEXTAUTH_SECRET` を設定しておくこと。
- `/admin_auth` 系エンドポイントはリフレッシュトークンを用いたローテーション方式に統一（`admin_refresh_tokens` テーブルで管理）。フロントは `remember_me=true` でログインし、失効時は `/admin_auth/refresh` にリフレッシュトークンを送る。
