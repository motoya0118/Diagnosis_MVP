# 09. アクティブ版一覧 (GET /admin/diagnostics/active-versions)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/09_admin_get_active_version.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — アクティブ版一覧カード
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
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostics`, `cfg_active_versions`, `diagnostic_versions`


## 実装フローの前提
- バックエンド API を整備した上でフロントエンドの一覧表示を実装する。
- フィルタ条件やレスポンスフォーマットに変更があれば引継ぎへ追記する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/09_admin_get_active_version.md`に従う

## フロントエンド
### 実装
- 管理画面のアクティブ版カード初期ロードで本 API を呼び、一覧表示する。
- フィルタ入力に応じて `diagnostic_id`/`diagnostic_code` クエリを切り替える UI を実装する。
- 未公開診断の表示 (null の場合のプレースホルダー) と更新ボタンの制御を設計する。
### テスト
- API レスポンスのモックを用いて一覧表示と未公開状態の UI を検証する。