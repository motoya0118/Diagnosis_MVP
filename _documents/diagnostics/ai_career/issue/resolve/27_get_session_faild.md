## タスク
- [ ] `frontend/lib/http/fetcher.ts` のブラウザ実行時に `/api/diagnostics` 経由になることを保証する単体テストを追加する
- [ ] 再現テスト（Playwright or Vitest + MSW）を作成し、ブラウザが直接バックエンドへ到達しないことを検証する
- [ ] フロント実装を修正し、Amplify Node（Next.js）経由でのみ診断バックエンドへアクセスするように統一する
- [ ] 回収した知見を `_documents/diagnostics/ai_career/front/03_共通診断画面.md` と `_documents/common/frontend/implementation_guidelines.md` に反映する
- [ ] 修正後の差分で `npm run test`（frontend）および `docker compose run --rm backend pytest` を実行し副作用がないことを確認する

## 発生している問題
frontendのcommonqa画面に遷移した際にsessionを取得するバックエンドAPIをコールする動作がブラウザから直接fetchする形になっており
APIコールが失敗する(そもそもバックエンドAPIはamplifyのnodeサーバーから実行する想定)
※遭遇した挙動は端末によってはcommonqa画面が正常に映ったりもする

codexとchatベースで修正するも解決しないため本issueを作成した。

<!-- ## 再現手順（実機）
1. Amplify 環境で `https://<app-domain>/diagnostics/common-qa?diagnostic_code=ai_career` へアクセスする
2. `network` タブで `POST https://<backend-domain>/diagnostics/ai_career/sessions` のリクエストがブラウザから直接発行されていることを確認する  
   - 期待値は `POST https://<app-domain>/api/diagnostics/diagnostics/ai_career/sessions` → Next.js ルートがバックエンドへプロキシ
3. 応答は `403 Forbidden`（CORS ブロック）もしくは `TypeError: Failed to fetch` となり、UI には「診断内容を読み込んでいます...」が出たまま進行しない
4. ブラウザにより挙動が揺らぎ、Safari（iOS）では成功 / Chrome（macOS）では失敗するケースが報告されている（要再現確認） -->

## 期待される挙動
- ブラウザは常に Next.js の `app/api/diagnostics/[...path]/route.ts` を叩き、Amplify Node サーバーからバックエンド API へ通信する
- Amplify 側で付与されるセッション Cookie・ヘッダーが保持され、`startDiagnosticSession` が 200 を返す

## 実際の挙動
- ブラウザが直接 `process.env.NEXT_PUBLIC_BACKEND_URL` のドメインへアクセスし、CORS 制約でブロックされる
- 失敗時は `frontend/features/diagnostics/commonQa/CommonQaScreen.tsx` の初期化ロジックが例外を握り潰し、空白＋ローダー状態で停止する
- 端末差については以下の仮説あり（要検証）
  - iOS Safari は Service Worker キャッシュ経由で `/api/diagnostics` を利用している
  - Chrome 系はビルド済みバンドルに埋め込まれた絶対 URL をそのまま利用している

## 調査メモ
- 直接アクセスされるリクエストは `frontend/features/diagnostics/commonQa/api.ts:19` の `startDiagnosticSession()` で発行される
- 同ファイルの `fetchDiagnosticForm()` も同様に `resolveDiagnosticsUrl()` を通して URL を生成しており、ビルド時に `typeof window === "undefined"` 判定が true になり絶対 URL がバンドルへ焼き込まれている可能性が高い
- `frontend/lib/http/fetcher.ts:46-84` の `resolveUrl()` はブラウザ実行時に `/api/diagnostics` へ書き換える設計だが、`Request` インスタンス経由で渡された場合は書き換えられず、そのまま backend ドメインへ飛ぶ
- 本番ビルド（`next build`）をローカルで起動すると同様にバックエンド直列挙動を再現できるとの報告があるため、開発環境でも同条件での確認が必要

## 修正案の方向性
1. `fetcher()` へ渡す引数を必ずプレーンなパス文字列に統一し、`Request` / `URL` オブジェクト経由のケースを排除する
