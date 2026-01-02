# 01. 診断一覧取得 (GET /admin/diagnostics)

## タスクチェックリスト
- [x] 規約を読む
  - [x] `_documents/common/backend/implementation_guidelines.md`
  - [x] `_documents/common/frontend/implementation_guidelines.md`
- [x] 共通機能を理解する
  - [x] `_documents/common/backend/CommonFunctionality.md`
  - [x] `_documents/common/frontend/CommonFunctionality.md`
- [x] 対象の設計書を読む
- [x] テストコードを作る(TDD)
- [x] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 対象設計書
- `_documents/diagnostics/ai_career/APIs/01_admin_get_diagnostics.md`
- `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` 共通フィルタ要件

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostics`, `cfg_active_versions`
- `_documents/diagnostics/ai_career/APIs/00_common.md` 認証/エラー共通仕様

## 実装フローの前提
- まずバックエンド API を完成させた後、フロントエンド実装に着手する。
- 共通フィルタ仕様や認可ハンドリングは以降のタスクでも共通化するため、共通化方針が決まれば引継ぎメモに残す。

## バックエンド
### 実装・テスト
- `_documents/diagnostics/ai_career/APIs/01_admin_get_diagnostics.md`に従って実装・テスト

## フロントエンド
### 実装
- 管理ダッシュボードの診断セレクト初期ロードで本 API を呼ぶ hooks を実装し、`include_inactive` 切り替え UI と連動させる。
- セレクト用に `label/value` を変換し、`is_active=false` の場合はバッジ表示を追加する。API レイヤーは SWR/React Query など既定のフェッチャーへ統合する。
- API エラー時のトースト出し分け (401/403/400) を設計書通りに反映し、アクセストークン失効時のリフレッシュハンドリングを確認する。

### テスト
- フロントの hooks/コンポーネントに対してモック API を用いたユニットテストを追加し、`include_inactive` トグル時のセレクト内容変化を検証する。
- エラー発生時に適切なトーストが表示されることをテストでカバーする。

## 実装メモ
- `GET /admin/diagnostics` を `backend/app/routers/admin_diagnostics.py` として追加。`include_inactive` クエリのパースを独自実装し、`true`/`false` 以外は `ErrorCode.DIAGNOSTICS_STATUS_INVALID (E011)` を返却。
- レスポンススキーマを `app/schemas/diagnostics.py` に定義し、`display_name` を `description` のフォールバックで生成。診断コード昇順で返却。
- 新設エラーコード `E011` を YAML に追記し、スクリプトで再生成。フロント管理画面側のエラー定義にも同コードを反映。
- Pytest を追加（`backend/tests/test_admin_get_diagnostics.py`）し、アクティブ診断のみ／非アクティブ含む／バリデーションエラー／認可エラーをカバー。MySQL 接続先が未設定の場合は別途 `TEST_DATABASE_URL` を用意して実行すること。
- 管理ダッシュボードに `useAdminDiagnostics` フックと UI を追加。セレクト + 非アクティブ表示 + 詳細カード + リロード操作に対応し、Vitest でフック挙動を検証済み (`npm run test`)。

## 未完了タスク
- FastAPI 側の pytest は DB 接続情報が揃い次第実行して最終確認する。
- 共通機能ドキュメント（バックエンド／フロントエンド）への追記要否をチームで確認し、必要であれば別途記載する。
- notion への引継ぎメモ・運用検討事項は本タスク完了時に整理する。
