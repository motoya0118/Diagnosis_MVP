# 10. 版詳細取得 (GET /admin/diagnostics/versions/{version_id})

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/10_admin_get_version_detail.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — SYSTEM_PROMPT/版情報カード
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
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `version_questions`, `version_options`, `version_outcomes`, `aud_diagnostic_version_logs`

## 実装フローの前提
- バックエンドで版詳細の情報集約を完成させてから、フロントの表示ロジックを整備する。
- プレビュー文字数など調整が必要になった場合は引継ぎへ記録する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/10_admin_get_version_detail.md`に従う。
※実装済みなので、設計書と差異がないかを確認し問題なければ対応不要でOK。差異がある場合は差分を修正する。

## フロントエンド
### 実装
- ダッシュボードの版詳細ビュー初期化時に本 API を呼び、サマリとステータスを表示する。
- `system_prompt_preview` をプレビュー欄に表示し、全文取得ボタンで別 API を呼ぶ導線を設置する。
- `audit` 情報を UI のラベルに反映する。
### テスト
- API レスポンスのモックを用いてステータス表示とプレビュー切替のテストを追加する。

## 引き継ぎ事項
- 詳細 API の拡張予定や関連するキャッシュ戦略があれば `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- 監査ログの肥大化やレスポンスサイズに関する懸念を `_documents/notion/diagnostics` に記録する。
