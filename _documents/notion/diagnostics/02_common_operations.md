# 02_00_common 運用メモ

- `FeedbackProvider` はブラウザのローカルストレージ利用可否を判定している。Safari プライベートモード等で `localStorage` が拒否された場合はメモリ保持＋警告トーストでフォローするが、ページ離脱で回答が失われるリスクがあるためガイド表示を検討。
- 共通診断フォームの取得は `fetchDiagnosticForm` が `ETag` を付与し 304 を許容する。CDN などでキャッシュする際は `ETag` を透過させるか、サロゲートキーでのパージと連動させること。
- 共通フェッチラッパ `lib/http/fetcher.ts` は `X-Device-Id` を自動付与する。API ドメインが増えた際はバックエンド側のレート制限がこのヘッダー前提で動作するか確認すること。
- `withActionLoading` によるスコープ管理はメモリ内の `Map` 頼み。長大なフォームで多数スコープを登録するケースではリークしないことを随時確認（`resetSession` 実行時にスコープも初期化する検討余地あり）。
- フロントテストは `ts-jest` + jsdom に切り替え済み。CI で `jest-environment-jsdom` のインストールを忘れないよう `package.json` の scripts を更新する際に注意。
- 版構成インポートの受け入れサイズはバックエンド側で未制限。Large XLSX を投入する場合は `StructureImporter` の処理時間と DB トランザクションタイムアウトを監視し、必要なら制限値（例: Nginx `client_max_body_size`）を設ける。
- Alembic `0008_link_version_options` は `version_options.question_id` を `version_question_id` に置き換える。移行前に `version_questions` に対応レコードが無いと UPDATE で NULL が残って失敗するため、手動データ投入がある環境では事前に version_questions との整合性を確認してから `alembic upgrade head` を実行する。
- エラー詳細にセル座標を返しているため、運用時はユーザーから報告されたセル番号をそのまま再現テストに利用する想定。ログには `aud_diagnostic_version_logs` の `new_value.warnings` が残るので監査画面で確認する。
- SYSTEM_PROMPT 更新カードは初回表示時に全文を取得するため、10万文字近いプロンプトを登録するとフロントレスポンスが数百 KB になる。運用で超大型プロンプトを扱う際はブラウザタイムアウトや差分表示に注意し、必要に応じてエディタの分割読込を検討。
