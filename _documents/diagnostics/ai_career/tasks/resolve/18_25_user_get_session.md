# 25. セッション取得 (GET /sessions/{session_code})

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/25_user_get_session.md`
  - [ ] `_documents/diagnostics/ai_career/front/04_診断結果画面.md` 
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
  - [ ] docker-compose build && docker-compose run --rm -e TEST_DATABASE_URL="$TEST_DATABASE_URL" backend pytest -q
  - [ ] docker compose run --rm admin_front sh -lc "npm ci || npm install; npm run test" 
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` 

## 実装フローの前提
- バックエンドの公開レスポンスを整えた後、フロントエンドの結果表示画面を実装する。
- レスポンス構造や CORS 設定で追加検討があれば引継ぎに記載する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/25_user_get_session.md`に従う

## フロントエンド
### 実装・テスト
`_documents/diagnostics/ai_career/front/04_診断結果画面.md` に従う

## 引き継ぎ事項
- セッション共有リンクの期限やアクセス制御の要件があれば `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- LLM 結果の保持期間や匿名アクセスの監査要件について懸念があれば `_documents/notion/diagnostics` に記載する。
