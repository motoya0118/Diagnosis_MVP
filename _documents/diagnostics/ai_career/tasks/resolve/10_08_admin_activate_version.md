# 08. アクティブ版切替 (POST /admin/diagnostics/versions/{version_id}/activate)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/08_admin_activate_version.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — アクティブ版切替カード
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
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `cfg_active_versions`, `aud_diagnostic_version_logs`

## 実装フローの前提
- バックエンドでアクティブ版切替の整合性チェックとログ出力を完成させた後、フロントエンドのモーダルを接続する。
- 切替結果を共有するためのログ出力仕様に変更があれば引継ぎに追記する。

## バックエンド
### 実装/テスト
`_documents/diagnostics/ai_career/APIs/08_admin_activate_version.md`に従う

## フロントエンド
### 実装
- アクティブ版一覧カードで切替モーダルを実装し、候補版をラジオリストで表示する。
- 切替成功時に一覧を再取得し、トーストを表示する。Draft を選択不可として UI で弾く。
- エラーコードに応じたモーダル内メッセージ (Draft 選択, 診断ID不一致) を実装する。
### テスト
- モーダル操作の統合テストと、エラー表示のスナップショット/ロジックテストを追加する。