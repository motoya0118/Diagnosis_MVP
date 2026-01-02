# 00. エラーコード共通基盤整備

## タスクチェックリスト
- [ ] 規約を読む
- [ ] 対象の設計書を読む
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/common/error_code_manage.md`
- `_documents/common/backend/implementation_guidelines.md`
- `_documents/common/frontend/implementation_guidelines.md`
- `backend/`, `frontend/`, `admin_front/` の現行実装

## 対象
- `backend`
- `frontend`
- `admin_front`

## 実装フローの前提
- バックエンドのエラーコード定義と生成を整備した上で、フロントエンド/管理フロントの連携へ進む。
- コマンド運用やファイル配置の決定事項は引継ぎに記録する。

## バックエンド
### 実装
- `backend/error_codes.yaml` を作成し、`_documents/common/error_code_manage.md` のスキーマで診断モジュールに必要なドメイン/コードを定義する。
- コード生成スクリプト（例: `backend/scripts/generate_error_codes.py`）を整備し、`app/core/errors.py` などで Enum/ヘルパーを提供する。`pytest` で生成物が利用されていることを確認する。
- 既存の例外処理を `ErrorCode` ベースへ置き換え、`BaseAppException` やレスポンスハンドラを導入する。
- CI/ローカルで生成チェック（`make generate-error-codes` 等）を実行できるようにする。
### テスト
- 代表的な API のエラー時に `ErrorCode` が返却されることを検証する pytest を追加する。

## フロントエンド（ユーザー向け）
### 実装
- `frontend/error_codes.yaml` を作成し、バックエンドと共有するコードに UI 用メタ情報（`ui_message`, `action` など）を追加する。
- 生成スクリプト（例: `frontend/scripts/generateErrorCodes.ts`）で `lib/error-codes.ts` を出力し、API クライアントやエラーハンドリングで活用する。
- 共通トースト・バナーでエラーコードを参照できるようにし、UI テキストは YAML を単一の情報源とする。
### テスト
- モック API を用いたユニットテストでエラーコードが UI 表示に反映されることを確認する。

## 管理者フロント
### 実装
- `admin_front/error_codes.yaml` を作成し、必要に応じて管理画面専用の UI メッセージを定義する（または `frontend` の定義を共有する）。
- 生成スクリプトで `src/lib/error-codes.ts` 等を出力し、API クライアント・トースト・フォーム検証でコードを参照する。
### テスト
- 管理画面の主要フローでコードが正しくマッピングされるユニットテストを追加する。

## 共通
- 生成スクリプトや `package.json`/`Makefile` にコマンドを追加し、開発者がローカル実行できるようにする。
- README または各プロジェクトのドキュメントにエラーコードの運用手順を追記する。
- CI（GitHub Actions 等）で YAML → 生成物の整合性チェックを実施する設定を追加する。

## 引き継ぎ事項
- 今後追加が想定されるコード群や、自動生成の制約事項を `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- 多言語化対応やメッセージ更新フローなどの懸念を `_documents/notion/diagnostics` に記載する。
