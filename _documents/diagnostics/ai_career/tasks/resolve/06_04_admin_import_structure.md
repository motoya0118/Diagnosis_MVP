# 04. 版スナップショット取込 (POST /admin/diagnostics/versions/{version_id}/structure/import)

## タスクチェックリスト
- [ ] 規約を読む
  - [x] `_documents/common/backend/implementation_guidelines.md`
  - [x] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [x] `_documents/common/backend/CommonFunctionality.md`
  - [x] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [x]`_documents/diagnostics/ai_career/APIs/04_admin_import_structure.md`
  - [x] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — インポート操作カード
- [x] テストコードを作る(TDD)
- [x] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [x] `_documents/common/backend/CommonFunctionality.md`
  - [x] `_documents/common/frontend/CommonFunctionality.md`
- [x] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [x] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `version_questions`, `version_options`, `version_outcomes`, `questions`, `options`, Outcome マスタ各種, `aud_diagnostic_version_logs`

## 実装フローの前提
- アップロード→解析→永続化のバックエンド処理を確定させてからフロントエンドの UX に取り組む。
- 取り込みフォーマットの差異が発生した場合は、検証結果を引継ぎ先へ共有する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/04_admin_import_structure.md`に従う

## フロントエンド
### 実装
- ファイルアップロード UI（ドラッグ&ドロップ/ファイル選択）とバリデーションを実装する。
- 送信中のプログレス表示と、取込件数/警告のレスポンス表示をカードに反映する。
- エラー時はセル位置付きの詳細をモーダル/テーブルで表示し、再アップロード操作をガイドする。
### テスト
- ファイル選択→API呼び出し→結果表示のフローと、エラー詳細表示をカバーするユニット/統合テストを追加する。

## 引き継ぎ事項
- 取り込み時の制約やフォーマット変更の希望があれば `_documents/notion/diagnostics` に整理する。

## 運用・検討事項
- アップロードファイルサイズの上限や処理時間に関する懸念があれば `_documents/notion/diagnostics` に記録する。
