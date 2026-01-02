# DBマイグレーション整備

## タスクチェックリスト
- [ ] 規約を読む
- [ ] 対象の設計書を読む
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` — テーブル・インデックス仕様
- `_documents/diagnostics/ai_career/APIs/00_common.md` — バリデーション/監査ログ整合性
- `backend/alembic/` 配下既存マイグレーション
- `backend/scripts/seed/seed_mst_ai_jobs.py` — マスタデータ整備
- `_documents/common/backend/implementation_guidelines.md`

## 実装フローの前提
- 既存マイグレーションとの差分を調査し、バックエンド基盤が揃ってからスキーマ追加を実行する。
- Alembic バージョンの枝分かれを避けるため、作業開始時に最新の head を確認する。

## 作業概要
- `DB設計.md` で定義された診断モジュール向けテーブルを Alembic で実装し、既存スキーマに追加する。
- 既存マイグレーションとの差分を調査し、重複や依存関係が無いよう適切なバージョン番号でスクリプトを追加する。

## 実施内容
- **調査**: 現行 DB (`alembic history`) と `DB設計.md` の差分を洗い出し、追加/変更が必要なテーブル・列・インデックスを一覧化する。
- **テーブル作成**: 以下のテーブルを Alembic スクリプトで作成。
  - `diagnostics`, `diagnostic_versions`, `aud_diagnostic_version_logs`, `cfg_active_versions`
  - `questions`, `options`, `version_questions`, `version_options`, `version_outcomes`
  - `sessions`, `answer_choices`
  - Outcome マスタ（`mst_ai_jobs`）に必要な列追加があれば同時対応
- **制約/インデックス**: 設計書記載の PK/UK/FK、`BTREE INDEX` をすべて定義。`ON DELETE RESTRICT` の外部キーや `OUTCOME_MODELS` 参照列に注意。
- **タイムスタンプ/デフォルト**: `created_at`/`updated_at` の非NULL制約、BOOLEAN 既定値、`is_active` フラグを設計通りに設定。
- **データ移行**: 既存データとの整合が必要な場合は `op.execute` 等で初期データ挿入 (`diagnostics` 初期行、`mst_ai_jobs` シーダー連携) を検討。{TODO: データ移行は不要なので破壊的に変更してOK}
- **ダウングレード**: すべてのテーブル/インデックス/制約に対する rollback 処理を記述。{TODO: データ移行は不要なので破壊的に変更してOK}

## 検証
- ローカルで `alembic upgrade head` を実行し、新スキーマで単体テスト・API テストが通ることを確認。
- 既存マスタシード (`python -m backend.scripts.seed.seed_mst_ai_jobs`) が新スキーマで成功することを検証。
- MySQL 8.0 で外部キー制約が有効に作成されることを `SHOW CREATE TABLE` で確認。
- CI/テスト環境でマイグレーションを差分適用し、破壊的変更が無いことをレビュー。

## 引き継ぎ事項
- 引き継ぎ情報(将来的にやった方がいいこと、後続のタスクで考慮すべきこと、運用上の注意点、実行方法etc..)は以下にファイルを作成して記載お願いします
- _documents/notion/diagnostics

## 運用・検討事項
- マイグレーションの適用順や長期的なスキーマ変更方針に関する懸念があれば `_documents/notion/diagnostics` に記載する。
