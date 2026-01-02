# 05. 診断版一覧取得 (GET /admin/diagnostics/{diagnostic_id}/versions)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ]`_documents/diagnostics/ai_career/APIs/05_admin_list_versions.md`
  - [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — バージョンセレクト挙動
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）


## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `cfg_active_versions`


## 実装フローの前提
- バックエンドで一覧 API を整備した後、フロントエンドのセレクト UI を実装する。
- 共通 hooks 化する場合は後続タスク向けに方針を引継ぎに残す。

## バックエンド
### 実装/テスト
`_documents/diagnostics/ai_career/APIs/05_admin_list_versions.md`に従う

## フロントエンド
### 実装
- ダッシュボードのバージョンセレクト取得ロジックを実装し、診断選択時に自動フェッチする。
- Draft/Finalize タブ切り替えに `status` クエリを活用し、`is_active` のラベル表示や `system_prompt_state` に応じた UI を実装する。
### テスト
- バージョンリスト取得 hooks のユニットテストと UI のスナップショット/ロジックテストを追加する。

## 引き継ぎ事項
- バージョンデータのキャッシュ戦略やセレクトコンポーネントの再利用方針を `_documents/notion/diagnostics` に記載する。

## 運用・検討事項
- 版数が増加した場合のページングや検索ニーズがあれば `_documents/notion/diagnostics` に記録する。
