# 共通機能早見表（バックエンド）

バックエンドで再利用される基盤機能の所在地と使い方をまとめます。初めて参画したメンバーがここを起点に設計書／コードへ辿れることを目的にしています。追加実装時は本ドキュメントを更新し、重複実装を避けてください。

---

## 1. エラーコードとレスポンス制御

- **定義元**: `backend/error_codes.yaml`  
  運用ルールは `_documents/common/error_code_manage.md` を参照。
- **コード生成**: `python -m backend.scripts.generate_error_codes` を実行すると `backend/app/core/errors.py` が上書き生成される（自動生成ヘッダー付き）。`--check` オプションで差分チェックも可能。
- **利用方法**:
  - 例外送出は `app.core.exceptions.raise_app_error(ErrorCode.XXX, detail=..., extra=...)` を利用。
  - FastAPI アプリ起動時（`app/main.py`）で `register_exception_handlers()` を呼び出すと、`BaseAppException`・`HTTPException`・`ValidationError`・想定外例外を共通ハンドラに集約できる。
- **補助機能**:
  - `BaseAppException.to_response_body()` がレスポンス JSON 形式を統一。
  - `ErrorCode.from_code()` でコード文字列から Enum を復元可能（ログや外部入力の正規化に利用）。

---

## 2. 認証・セキュリティ共通ユーティリティ

- **JWT / パスワード**: `backend/app/core/security.py`
  - `get_password_hash` / `verify_password`: `passlib` で bcrypt ハッシュ化。
  - `create_access_token(subject, expires_delta_minutes, extra)`：JWT（HS256）を発行。`extra` で role などを埋め込む。
  - `create_refresh_token(subject, expires_delta_days)`：高エントロピーな不透明トークンと有効期限（UTC）を返却。DB にはハッシュ化した値を保存する想定。
  - `validate_jwt_token(token, required_roles, error_on_invalid=..., error_on_forbidden=...)`：署名と `exp` を検証し、ロール（`roles`/`role` claim。未設定時は `"user"` 扱い）を小文字集合で正規化した `TokenClaims(subject, roles, payload)` を返す。共通エラーコードをパラメータで指定できる。
    - 例: 管理者 API では `required_roles={"admin"}`、`error_on_invalid=ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_INVALID`、`error_on_forbidden=ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_SCOPE_INVALID`。
    - 例: ユーザー API では `required_roles={"user", "admin"}`、`error_on_invalid=ErrorCode.AUTH_INVALID_TOKEN`。
  - `decode_token(token)`：低レベルにペイロードを抽出したい場合のサポート関数（基本は `validate_jwt_token` を利用）。
- **HTTP Depends**:
  - `backend/app/deps/auth.py`: 一般ユーザー向け。`get_db()`・`get_current_user()` を提供。`HTTPBearer` でアクセストークンを受け取り、`validate_jwt_token(..., required_roles={"user","admin"})` で検証→ユーザー照会→`ErrorCode.AUTH_*` で例外化。
  - `backend/app/deps/admin.py`: 管理者向け。`get_current_admin()` が `validate_jwt_token(..., required_roles={"admin"})` 経由でロールを確認し、`ADMIN_AUTH_*` のエラーを返す。
  - これらを各ルーターで `Depends(...)` すれば認可ロジックを再利用できる。

---

## 3. 認証 API（共通フロー）

- **ユーザー向け**: `backend/app/routers/auth.py`
  - `/register` `/login` `/refresh` `/logout` `/logout_all` を提供。
  - GitHub OAuth (`/oauth/github`) は `authlib` + GitHub API を利用してユーザー作成／リンクを行う共通処理。
  - リフレッシュトークンは `RefreshToken` テーブルで管理し、デバイス ID を照合。照合失敗時は `ErrorCode.AUTH_REFRESH_DEVICE_MISMATCH` で全セッションを失効させる。
- **管理者向け**: `backend/app/routers/admin_auth.py`
  - `/login` `/refresh` `/me` を提供。`create_access_token(..., extra={"role": "admin"})` によりアクセストークンへ `role` を埋め込み、`get_current_admin()` で検証。

---

## 4. 診断ドメイン共通ロジック

- **アウトカムモデル解決**: `backend/app/core/registry.py`
  - `resolve_outcome_model(table_name)` が `diagnostics.outcome_table_name` から SQLAlchemy モデルを特定する。
  - `compute_version_options_hash(version_id, option_ids)` は診断バージョン毎の選択肢セットを SHA-256 でハッシュ化し、LLM キャッシュキーに利用。
  - 新しい outcome モデルを追加する場合は `OUTCOME_MODEL_REGISTRY` に追記する。
- **テンプレート取込ロジック**: `backend/app/services/diagnostics/structure_importer.py`
  - `StructureImporter.import_version_structure` が XLSX を解析し、`questions`/`options`/`outcomes` の UPSERT と版テーブルの再生成をまとめて行う。
  - パースエラー時は `StructureImportParseError` を投げ、`error.extra.invalid_cells` にセル座標を格納できる。
  - アウトカムマスタのユニークキーは `OutcomeModelBinding.key_columns` で定義し、追加診断時にレジストリを更新する。
- **監査ログ記録**: `backend/app/services/diagnostics/audit.py`
  - `record_diagnostic_version_log(...)` が `aud_diagnostic_version_logs` への書き込みを共通化。`note`/`old_value`/`new_value` は JSON 文字列として正規化される。
- **マスターデータ API**: `backend/app/routers/master.py`
  - `GET /master/{key}` が `mst_*` テーブルを反射し、ETag や schema 情報付きで返す。
  - `GET /master/bundle?keys=...` は複数キーをまとめて取得。
  - `GET /master/versions` はテーブル毎の ETag を返し、フロントの差分更新やキャッシュ制御に利用できる。
  - 不正キーや未存在テーブルは `ErrorCode.MASTER_*` で例外化。

---

## 5. スキーマ／モデルの共通事項

- **Pydantic スキーマ**: `backend/app/schemas/auth.py`・`backend/app/schemas/admin_auth.py` などでリクエスト／レスポンスを定義。共通フィールド（`TokenPair` など）はここを参照して再利用する。
- **SQLAlchemy モデル**: `backend/app/models/` 以下に診断用テーブルとリフレッシュトークン等を集約。関連する監査テーブルや OAuth テーブルも同ディレクトリから確認できる。

---

## 6. 補助スクリプトと開発フロー

- `scripts/generate_error_codes.py`: 上記の通りエラー定義を生成。CI で `--check` を走らせると生成漏れを検出できる。
- `alembic/` 配下: マイグレーションは診断ドメインや権限周りの schema 追加に利用。新規マスターテーブル追加時もここを更新。
- Docker / env 設定は `backend/.env.*` と `docker-compose.yml` を参照。共通環境変数の運用ルールは `_documents/common/backend/implementation_guidelines.md` を踏襲。
- **テスト DB ユーティリティ**: `backend/tests/utils/db.py`
  - `truncate_tables(engine, tables=...)` が AUTOCOMMIT の別接続で `TRUNCATE` + `FOREIGN_KEY_CHECKS` を実行し、トランザクション中のセッションにロックを残さずデータを初期化できる。
  - デフォルトでは診断系テーブルを一括削除。マスタ系（例: `mst_ai_jobs`）など追加で必要なテーブルは引数で指定する。
  - 各テストモジュールの `db_session` Fixture 冒頭で呼び出し、Factory が生成するデータと衝突しない“まっさら”な状態を保証する。

---

## 7. 利用時のチェックリスト

1. 新機能でエラーが必要 → `error_codes.yaml` を更新し、生成スクリプトを実行。フロントと合わせてエラーコードの整合性を保つ。
2. 認証が絡む → 既存の `/auth`・`/admin_auth` ルーターと `deps/` を再利用し、重複実装を避ける。
3. 診断結果や監査が関与 → `core/registry.py`・`services/diagnostics/audit.py` のユーティリティを使う。
4. マスターデータを提供 → `master` ルーターのレスポンス形式に合わせる（ETag・`schema` を必ず返す）。

ドキュメントに記載の無い共通処理を追加した場合は、本書に追記してください。
