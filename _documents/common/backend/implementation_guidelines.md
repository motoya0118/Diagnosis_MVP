# バックエンド実装規約（FastAPI / backend 配下）

本ドキュメントは `./backend` ディレクトリの実装方針を統一し、開発者が迷わず拡張できるようにするための規約です。既存コード（README の記述・現行モジュール構成）と矛盾しない範囲で策定しています。

---

## 1. プロジェクト構成と責務

```
backend/
├── app/
│   ├── main.py                # FastAPI エントリポイント
│   ├── core/                  # 共通設定・セキュリティユーティリティ
│   │   ├── config.py          # Pydantic Settings
│   │   └── security.py        # JWT 発行/検証など
│   ├── db/                    # SQLAlchemy Base/Session・接続まわり
│   ├── deps/                  # 依存解決関数（Depends で利用）
│   ├── models/                # SQLAlchemy モデル（1 ファイル 1 エンティティが原則）
│   ├── schemas/               # Pydantic スキーマ（リクエスト/レスポンス定義）
│   └── routers/               # APIRouter 定義（機能単位で分割）
├── alembic/                   # マイグレーションスクリプト
├── scripts/                   # メンテナンススクリプト（seed など）
├── tests/                     # pytest テストケース
└── admin_register.py / start.sh など補助ツール
```

### 1.1 追加実装時の配置ルール
- **Router**: `app/routers/<domain>.py`。ファイル名は `snake_case`。`APIRouter(prefix="/diagnostics", tags=[...])` のようにプレフィックスを明示します。エンドポイントは責務別にモジュールを分け、肥大化した場合はサブパッケージ化（例: `app/routers/diagnostics/__init__.py`）して管理します。
- **Schema**: `app/schemas/<domain>.py` に Pydantic モデルをまとめ、`<Action>Request` / `<Action>Response` / `<Model>Out` など用途が判る名称に統一。入力値は `*Request`, 出力値は `*Response` or `*Out` を目安にします。
- **Model**: `app/models/<entity>.py` に SQLAlchemy モデルを 1 クラス 1 ファイルで定義。命名は `PascalCase`、テーブル名は `__tablename__ = "snake_case_plural"` を徹底します。関連が多い場合は同ファイル内で補助的な `Enum` やリレーション設定を行います。
- **サービス/ドメインロジック**: ルーターに複雑なビジネスロジックを書かず、`app/services/<domain>.py`（新規作成可）などへ切り出してください。`services` パッケージを追加する場合は 1 機能 1 モジュールを原則とします。
- **依存関数**: 共通で再利用する DB セッション・権限チェックは `app/deps/` に配置し、`Depends` で注入します。
- **設定値/ユーティリティ**: `app/core/` に集約。設定値は `config.Settings` から取得し、その他の共通処理（パスワードハッシュなど）は `core` 配下に配置します。

---

## 2. 命名規則・コーディングスタイル
- Python は **PEP 8** を踏襲し、インポート順は `isort` 互換の `stdlib → third-party → project`。
- 型ヒントを必須とし、FastAPI エンドポイントは `async def` を基本とします。
- 例外は `app.core.exceptions`（新設可）にベースクラスを置き、`raise ErrorCode.XYZ.to_http_exception()` のように統一的に扱います。
- SQLAlchemy モデルの主キーは `id`、外部キーは `<entity>_id`。`created_at`/`updated_at` は `datetime`（UTC）で non-null。
- モジュールテストに必要な Fixture は `tests/conftest.py` へ集約し、新規 Fixture もここに定義 or 適切に分割します。

---

## 3. エラーコード管理
- **唯一の定義元**: `backend/error_codes.yaml` に全エラーコードを定義します（`_documents/common/error_code_manage.md` の運用方針を踏襲）。
- **コード生成**: YAML 更新後は `python -m scripts.generate_error_codes`（仮。既存スクリプトに合わせる）を実行し、`app/core/errors.py` などの自動生成ファイルを更新します。生成物をコミットしない PR は失敗させる想定です。
- **利用方法**: ルーター/サービスでは `from app.core.errors import ErrorCode` を import し、`ErrorCode.E001_DIAGNOSTIC_NOT_FOUND.raise_()` のような専用ヘルパを通じて HTTP エラーを返します。生のステータスコード + メッセージの散在は禁止です。
- **ドキュメント更新**: エラーコード追加時は API ドキュメント（`_documents/diagnostics/ai_career/APIs/*.md` など）とテストを同時更新し、検索で追跡できる状態を保持します。

---

## 4. マイグレーションと DB 運用
- スキーマ変更は必ず Alembic マイグレーションを追加し、`alembic upgrade head` が成功することを確認してから PR を作成します。
- マイグレーションファイル名は連番 + 要約（例: `0003_add_diagnostic_tables.py`）。`upgrade()` と `downgrade()` の双方を実装し、外部キーやインデックスも設計書通りに定義します。
- 新テーブルに対応する ORM モデル/スキーマ/テストを同 PR で追加し、設計書 (`_documents/diagnostics/ai_career/DB設計.md`) との乖離が無いかレビュー時にチェックします。
- 初期データ挿入が必要な場合は `scripts/` にシードスクリプトを追加し、README などに手順を追記します。

---

## 5. 環境変数と設定管理
- **単一の定義源**: `backend/.env.{environment}`（`development`/`staging`/`production`）を用意し、`docker-compose.yml` の `env_file` で切り替える。`env-sample/` にはテンプレートを置き、新規環境作成時はここをコピーする。FastAPI 本体は Pydantic Settings (`config.py`) 経由で値を読み取る。
- **FastAPI 側の読み取り**: `Settings(env_file='.env')` などで `BaseSettings` を構成し、環境別ファイルを指定する。新たな変数を追加したら `Settings` にフィールド定義し、該当 `.env.*` と `docker-compose.yml` の `env_file` に追記する。
- **命名ガイドライン**: `SERVICE_NAME__SETTING` 形式で名前衝突を避ける（例: `DIAGNOSTICS__LLM_ENDPOINT`）。URL や認証情報など機密性の高い値は `.env.*` で管理し、Compose には `${VAR_NAME:-default}` の形で参照だけを記載する。
- **環境ごとの差し替え**: `docker compose --env-file backend/.env.${ENV}` のように起動し、dev/stg/prd の値を切り替える。CI/CD でも同じファイル構成を前提とし、Secrets を `.env.production` 相当の環境変数として注入する。
- **ドキュメント更新**: 新しい環境変数を導入した場合は README・本書・関連スクリプトに追記し、利用手順を明示する。

---

## 6. テスト方針
- 新規または変更を加える API / サービスには **可能な限り pytest テストを追加**します。カバレッジを担保するため、以下の観点を押さえてください。
  - 正常系: 代表的な入力で期待通りのレスポンス/副作用になること。
  - 異常系: エラーコード（`ErrorCode`）が設計書通りに返ること。
  - DB 副作用: 追加/更新/削除の結果が想定通りかを確認。
- 既存の `client` Fixture（FastAPI TestClient）と DB 初期化 Fixture を活用し、テストは `tests/test_<domain>_*.py` のファイル名に揃えます。
- モックが必要な外部 API（例: Bedrock）は `pytest-mock` や `unittest.mock` を利用して差し替え、安定したテストを実現します。
- PR では `pytest` を実行し、失敗しないことを必須条件とします。将来的な CI 導入を前提に `pytest.ini` の設定を更新する場合はチームに共有してください。
- `tests/conftest.py` では `TEST_ISOLATED_DB=1` を既定で有効化し、各テストセッションごとに一時スキーマを作成します。原則としてテスト内で `db_session.commit()` は行わず、トランザクション境界は Fixture に任せてください（どうしてもコミットが必要なケースは `uuid.uuid4()` などでユニーク値を採番し、後片付けまで実装する）。
- テスト用の MySQL コンテナ（`db_test`）を利用し、`ENV=test` では `TEST_DATABASE_URL` を通じて専用 DB にのみ接続する。本番／開発 DB を指す URL でテストを実行しないこと。
- テーブル初期化は `tests/utils/db.truncate_tables()` を利用し、AUTOCOMMIT の別接続で `TRUNCATE` と `FOREIGN_KEY_CHECKS` を実行する。セッションと同じ接続で `TRUNCATE` を呼ぶとメタデータロックが残り、テストがハングする原因になるため禁止。
- Factory を利用する場合でも、ユニーク制約を持つカラム（`user_id` や `code` 等）が既存レコードと衝突しないよう、必要に応じて UUID ベースの値を与えてください。使い回す値を決め打ちにするとテストが汚染されて後続ケースが失敗する恐れがあります。

---

## 7. ドキュメントとレビュー
- 実装時は該当する仕様書（API 設計、DB 設計、タスク分解）を更新し、コードとの差異が生まれないようにします。
- レビューでは以下を確認します。
  1. ディレクトリ配置・命名が規約に従っているか。
  2. エラーコードが YAML と一致しているか。
  3. マイグレーション・モデル・テストがセットで揃っているか。
  4. README やスクリプトに追加手順が必要な場合、適切に追記されているか。
- 設計書とコードに差異が生じた場合は、差分を可視化した上でタスク化し、速やかに解消します。

---

## 8. 今後の拡張指針
- ドメインごとのディレクトリ（例: `app/modules/diagnostics/`）を導入する場合、本規約を基にサブ規約を作成し、`routers`/`schemas`/`services` をモジュール内で完結させる構成を採用します。
- 共通ライブラリ化が必要な処理（例: LLM クライアント、監査ログ、キャッシュ）は `app/core` か `app/services/common` に集約し、重複実装を避けます。
- エラーコード生成やマイグレーション管理など、手動漏れが想定されるタスクは `make` や `npm scripts` にコマンドを追加し、自動化を推進してください。

この規約に従い、バックエンドの保守性と一貫性を向上させていきます。
