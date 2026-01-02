# 13-1. ai_career診断用TOP画面作成
## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents\diagnostics\ai_career\front\02_診断トップ.md`
- [ ] 方針を理解する
- [ ] 方針に従って実装する
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
  - [ ] docker compose run --rm admin_front sh -lc "npm ci || npm install; npm run test" 
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）


## 方針
- `frontend\app\(public)\ai-career`をオミットする(コンポーネントも対応するテストも不要なので削除)
- `_documents\diagnostics\ai_career\front\02_診断トップ.md`に従って実装する(ページの内容はオミットした↑をベースにする)
- `frontend\components\layout\Header.tsx`のITキャリア診断リンクを今回作成したページに切り替える