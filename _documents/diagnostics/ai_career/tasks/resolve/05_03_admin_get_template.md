# 03. 版テンプレートDL (GET /admin/diagnostics/versions/{version_id}/template)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ]`_documents/diagnostics/ai_career/APIs/03_admin_get_template.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — テンプレートダウンロードカード
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `version_questions`, `version_options`, `version_outcomes`, `questions`, `options`, `mst_ai_jobs`

## 実装フローの前提
- バックエンドのテンプレート生成とファイルレスポンスを先に完成させてから、フロントエンドのダウンロード UI を調整する。
- Excel 形式の仕様差異が発生した場合は、調査結果を引継ぎメモへ残す。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/03_admin_get_template.md`に従う

## フロントエンド
### 実装
- ダッシュボード UI で診断/版セレクトの組み合わせから API リクエスト URL を構築し、`version=0` の場合は `diagnostic_id` を付与する。
- ダウンロード進行中のローディング状態と、エラー時のモーダル表示を実装する。
### テスト
- フック/サービスのユニットテストで API 呼び出しパラメータとエラーハンドリングを確認する。

## 引き継ぎ事項
- Excel 出力の列仕様やフロントのダウンロードコンポーネントで共有したい注意点があれば `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- テンプレート仕様変更やサイズ増大時のパフォーマンス懸念があれば `_documents/notion/diagnostics` に記録する。
