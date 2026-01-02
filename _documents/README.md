# `_documents` 配下ディレクトリガイド

## 1. クイックリファレンス
| パス | 主題 | ここを読むと分かること |
| --- | --- | --- |
| `_documents/auth-design.md` | サインイン設計 | GitHub OAuth + FastAPI 認証の責務分離、トークン/LT管理、NextAuth での UX 方針。
| `_documents/admin_auth/` | 管理者認証 | Admin 専用フロント/バックの分離と、`admin_user` テーブル・登録バッチの仕様。 
| `_documents/common/` | 横断ルール | バック/フロント実装規約、エラーコード運用、マスターデータ方針、DB命名規約、共通タスクの進め方。
| `_documents/diagnostics/` | 診断ドメイン | コンセプト図、AI Career 診断の DB・API・画面仕様、タスク/課題/LLM プロンプト資産。

## 2. カテゴリ別の詳説

### 2.1 認証関連
- **`_documents/auth-design.md`**: 資金調達向けにまとめた認証/認可の全体設計。NextAuth と FastAPI の役割分担、JWT + 不透明 RT の運用、GitHub OAuth のシーケンスや ER 図がまとまっているので、新規認証フローやセキュリティレビューの出発点になります。
- **`_documents/admin_auth/設計書.md`**: 管理画面を `admin_front` に分離し、Amplify Hosting へ独立デプロイする構成と、`backend/app/routers/admin_auth.py` による専用 API・`admin_user` マイグレーション・CLI バッチの要件を簡潔に整理しています。管理者ログインを追加・変更したいときに必読です。

### 2.2 共通基盤（`_documents/common/`）
- **実装規約**: `backend/implementation_guidelines.md` と `frontend/implementation_guidelines.md` がディレクトリ構成、命名、エラー処理、テスト/CI の型を定義。新機能追加時のファイル配置・命名で迷ったら参照します。
- **共通機能ハンドブック**: `backend/CommonFunctionality.md` と `frontend/CommonFunctionality.md` が、既存のエラー生成、NextAuth ラッパー、診断セッション管理、マスター API などの再利用ポイントを索引化。車輪の再発明を防ぐガイドです。
- **データ運用ポリシー**: `master-data-policy.md` がマスタ API / Front API のキャッシュ方針、`error_code_manage.md` がコード体系と生成フロー、`team_db_naming.md` が MySQL 命名規約を規定。DB・API・UI で一貫性を保つための根拠になります。
- **タスク記録**: `tasks/resolve/*.md` は共通系タスクごとのチェックリストと判断メモ（例: `01_add_test_db.md` はテスト DB 分離の理由と compose 設定）。同系統の案件を再開するときに履歴をなぞれます。

### 2.3 診断ドメイン（`_documents/diagnostics/`）
- **コンセプト/図面**: 直下の `concept.dio` が診断サービス全体のブロック図。
- **`ai_career/` 核心設計**:
  - ~~`キャリア診断設計書.md`: Option→Facet→MstAiJob のスコアリング式、ER 図、版管理ルールを網羅。~~ ボツ
  - `DB設計.md`: MySQL テーブル定義と制約、監査テーブル/多型参照の詳細。DDL 変更やレビューのベース。
  - `運用・データフロー設計.md`: 管理者が版を作成→アクティブ化する手順、ユーザー診断→LLM 呼び出し→セッション連携までのシーケンス図で運用視点を押さえられます。
  - `diagnostic_template*.xlsx`: インポートテンプレート原本。StructureImporter の期待フォーマットを確認できます。
- **API 仕様 (`ai_career/APIs/`)**: `00_common.md` が認証/エラー/共通パラメータを定義し、`01_admin_get_diagnostics.md`〜`10_admin_get_version_detail.md` が管理 API、`20_user_start_session.md`〜`25_user_get_session.md` がユーザー API を TDD 向けに細分化。`APIs/O&M/` には運用観点のダイアグラム、`APIs/ref/` には登録フロー例が格納されています。
- **フロント設計 (`ai_career/front/`)**: `01_管理ダッシュボード.md` など画面別に UI 構成、状態管理、エラー表示ルールを記述。バックログから画面要件を引き出す際の一次資料です。
- **課題/タスクトラッキング**:
  - `tasks/resolve/*.md`: 各 API/画面タスクのチェックリスト、参照設計書、TDD 方針、実装メモを保存（例: `03_01_admin_get_diagnostics.md`）。
  - `issue/` は障害・仕様バグの整理、`issue/resolve/` に調査/修正メモ（例: `21_質問共通画面の仕様.md`）。`issue/ref/` の XLSX で再現データも追える構成です。
- **LLM サンプル (`llm_sample/`)**: `sample_system_prompt.md` と `user_prompt.json` で本番プロンプトを共有。LLM の再学習やキャリブレーションに利用できます。

## 3. 活用上のヒント
1. **新タスクの着手順**: まず `_documents/common/*.md` で横断ルール→該当ドメイン(`diagnostics` など)→タスク固有の `tasks/resolve/*.md` を読む流れだと、スコープと前提が明確になります。
2. **仕様と実装の紐付け**: API/画面ごとに設計書 (`ai_career/APIs/*`, `front/*`) とタスクメモ (`tasks/resolve/*`) がペアで存在し、テスト観点やエラーコードの参照元も列挙されているので、実装/レビュー時はペアで確認するのが効率的です。
3. **運用・リリース**: インフラ系ドキュメントと Notion ハンドオーバーは、本番デプロイやデータ更新を伴う作業の手順書としてそのまま利用できます。特に `運用コマンド.md` + `implementation-notes-mst-ai-jobs.md` でマスタ更新〜再配信までの ToDo を網羅できます。
