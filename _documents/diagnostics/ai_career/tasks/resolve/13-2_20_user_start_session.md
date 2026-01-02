# 20. セッション開始 (POST /diagnostics/{diagnostic_code}/sessions)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/20_user_start_session.md`
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
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostics`, `cfg_active_versions`, `sessions`
- `_documents/diagnostics/ai_career/front/02_診断トップ.md` — 診断開始導線
- `_documents/diagnostics/ai_career/APIs/00_common.md`

## 実装フローの前提
- バックエンドのセッション発行 API を完成させてから、フロントエンドのステート管理を組み込む。
- セッションの再利用戦略が以降のタスクに影響する場合は引継ぎに残す。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/20_user_start_session.md`に従う

## フロントエンド
### 実装
- 診断トップ/共通診断画面で API を呼び、レスポンスをローカルストレージまたはコンテキストの診断ステートに保存する。
- 既存ステートが存在する場合は `version_id`/`session_code` の再発行判定を実装する。
- エラー時に再試行/診断選択ミスのガイドを表示する。
### テスト
- API モックで初期化フロー（新規/既存ステート更新）のユニットテストを追加する。
