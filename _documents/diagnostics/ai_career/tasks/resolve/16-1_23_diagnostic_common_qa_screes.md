# 23. diagnostic_common_qa_screen画面(03_共通診断画面)の作成

## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/front/03_共通診断画面.md` 
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
  - [ ] docker compose run --rm admin_front sh -lc "npm ci || npm install; npm run test" 
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
_documents/diagnostics/ai_career/tasks/resolve/13-2_20_user_start_session.md
_documents/diagnostics/ai_career/tasks/resolve/14_21_user_get_form.md
_documents/diagnostics/ai_career/tasks/resolve/15_22_user_submit_answer.md

## 実装フローの前提
以下のコミットIDでバックエンドAPIとフロントで呼び出せるようのwrap, 共通機能を作っているので再利用してください(車輪の再発明はしないこと)
- a4c8c285efccdf76d9f0f13a9d7c73486e3d56fe
- e845da9e6b7f7333c5ecb67090bfe17222904fb4
- 0b34dfd5f08531024a16d5445c1fe1b2ff09f4df

## フロントエンド
### 実装・テスト
`_documents/diagnostics/ai_career/front/03_共通診断画面.md` に従う