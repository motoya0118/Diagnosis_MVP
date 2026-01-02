# 06. システムプロンプト更新 (PUT /admin/diagnostics/versions/{version_id}/system-prompt)

## タスクチェックリスト
- [ ] 規約を読む
- [ ] 対象の設計書を読む
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/APIs/06_admin_update_system_prompt.md`
- `_documents/diagnostics/ai_career/DB設計.md` : `diagnostic_versions`, `aud_diagnostic_version_logs`
- `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` — SYSTEM_PROMPT 編集カード
- `_documents/common/backend/implementation_guidelines.md`
- `_documents/common/frontend/implementation_guidelines.md`

## 実装フローの前提
- Draft 判定やバリデーションを含むバックエンドの更新ロジックを完成させた後、フロントのエディタへ接続する。
- プロンプトの取り扱いガイドラインが変わる場合は引継ぎへ反映する。

## バックエンド
### 実装
- `version_id` の存在確認と Draft 判定 (`src_hash IS NULL` でのみ更新可) を実装し、Finalize 済みは 409 (`E020_VERSION_FROZEN`) を返す。
- リクエストボディの `system_prompt` を空文字→`NULL` に丸め、10 万文字上限チェック (`E031_IMPORT_VALIDATION`) を実装する。
- `diagnostic_versions` 更新と `aud_diagnostic_version_logs` への `PROMPT_UPDATE` 追記を同トランザクションで実装し、`new_value` には `SHA256` を格納する。
- レスポンスで更新後の `system_prompt`（NULL 化後）と `updated_at/updated_by_admin_id` を返却する。
### テスト
- 正常更新/Finalize 済み/文字数超過/空文字→NULL/監査ログ記録を網羅する API テストを TDD で作成する。
- `SHA256` ハッシュがログに格納されることを確認するテストを追加する。

## フロントエンド
### 実装
- SYSTEM_PROMPT エディタのロード時に `10_admin_get_version_detail` で preview を取得し、全文読み込み API を併用する。
- 保存ボタンの活性状態 (Draft のみ) と文字数カウント/上限超過のバリデーション UI を実装する。
- 保存成功時のトーストと、`updated_at/by` ラベルの更新を行う。
### テスト
- 入力文字数制限、Draft/Finalize でのボタン状態、API 成功/失敗時の UI 変化をテストする。

## 引き継ぎ事項
- プロンプト編集のワークフローやエディタコンポーネントの再利用について `_documents/notion/diagnostics` に記録する。

## 運用・検討事項
- 長文プロンプト保存時のパフォーマンスやバージョン管理の懸念があれば `_documents/notion/diagnostics` に記載する。
