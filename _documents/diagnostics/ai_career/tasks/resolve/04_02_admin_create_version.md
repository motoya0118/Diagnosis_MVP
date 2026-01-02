# 02. 診断版作成 (POST /admin/diagnostics/versions)

## タスクチェックリスト
## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/02_admin_create_version.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — 版新規作成カード
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `aud_diagnostic_version_logs`
- `_documents/diagnostics/ai_career/APIs/00_common.md`

## 実装フローの前提
- バックエンドのエンドポイント完成後にフロントエンドのフォーム実装へ進む。
- マイグレーションや監査ログの仕様に不明点があれば、解決後に引継ぎ先へ記載する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/02_admin_create_version.md`に従う

## フロントエンド
### 実装
- 管理ダッシュボードの「版の新規作成」フォームから本 API を呼び出し、成功時にトーストとバージョンリスト再取得を実装する。
- バリデーションエラー時のフォーム表示（文字数超過、未選択等）と API エラーコードに応じたメッセージ分岐を実装する。
### テスト
- フォーム送信フローのユニットテスト（成功時、API エラー時）を追加し、バリデーション文言が UI に反映されることを確認する。
