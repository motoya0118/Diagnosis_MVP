# 07. Finalize (POST /admin/diagnostics/versions/{version_id}/finalize)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ]- `_documents/diagnostics/ai_career/APIs/07_admin_finalize_version.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — 版フリーズ操作
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）
## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `version_questions`, `version_options`, `version_outcomes`, `aud_diagnostic_version_logs`

## 実装フローの前提
- バックエンドの Finalize 処理と検証ロジックを完成させた後、フロントエンドの操作 UI を接続する。
- ハッシュ算出ルールが以降のタスクに影響する場合は引継ぎに残す。

## バックエンド
### 実装/テスト
`_documents/diagnostics/ai_career/APIs/07_admin_finalize_version.md`に従う

## フロントエンド
### 実装
- ダッシュボードの「版フリーズ」ボタンに確認モーダルを実装し、成功時にバージョン一覧を再取得する。
- Finalize 済み版の UI 分岐（編集不可/アクティブ候補）を更新する。
- エラー (`E030_DEP_MISSING` など) をモーダル内で表示し、原因説明を添える。
### テスト
- Finalize 操作フローの UI テストとエラー表示確認を実施する。

## 引き継ぎ事項
- Finalize 後の自動処理や通知要件があれば `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- Finalize の頻度やロールバック手段に関する検討事項があれば `_documents/notion/diagnostics` に記録する。
