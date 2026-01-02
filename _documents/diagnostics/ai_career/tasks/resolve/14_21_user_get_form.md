# 21. フォーム取得 (GET /diagnostics/versions/{version_id}/form)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/21_user_get_form.md`
  - [ ] `_documents/diagnostics/ai_career/front/03_共通診断画面.md` — 初期化フロー
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
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `version_questions`, `version_options`, `version_outcomes`

## 実装フローの前提
- バックエンドのフォーム取得 API を完成させてから、フロントのフォーム構築を実装する。
- `ETag` やキャッシュ戦略の決定事項は引継ぎへ記録する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/21_user_get_form.md`に従う

## フロントエンド
### 実装
- 共通診断画面の初期化で本 API を呼び、取得結果をローカルキャッシュ (SWR 等) に保存する。
- `option_lookup` を使った回答保存ロジックを実装し、`multi` に応じて UI を切り替える。
- `ETag` を活用した条件付きリクエストを実装し、キャッシュの invalidation を制御する。
### テスト
- API レスポンスのモックを用いたフォーム構築テスト (単一/複数選択、アウトカム表示) を追加する。

## 引き継ぎ事項
- フォームキャッシュの有効期限や `ETag` 運用ルールが決まれば `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- フォーム構成変更時の互換性やレスポンスサイズの懸念があれば `_documents/notion/diagnostics` に記載する。
