# プロジェクト概要

本リポジトリは、生成AIを有効活用すると診断アプリをスケールしやすいデータ構造にできるという
PoC実装になります。

元々、創業前の企業に無償でPoCを作っていたものを改変して公開します。
そのため、本題と離れるログイン認証が実装されていたり,Bedrock経由でLLMに接続できたりもします。

- フロントエンド: Next.js + NextAuth.js
- 管理者フロント: Next.js（シンプルな JWT コンソール）
- バックエンド: FastAPI
- DB: MySQL（Alembicでマイグレーション管理）
- ORM: SQLAlchemy
- 認証: Email/Password + GitHub OAuth、JWT（アクセストークン）+ リフレッシュトークン方式

---

## 構成

- `backend/`: FastAPI アプリケーション
  - `app/main.py`: ルーター登録、エントリポイント
  - `app/routers/auth.py`: 認証エンドポイント（登録/ログイン/リフレッシュ/ログアウト/GitHub OAuth）
  - `app/routers/admin_auth.py`: 管理者向け JWT 発行/更新エンドポイント
  - `app/routers/users.py`: `GET /users/me`
  - `app/models/user.py`: `User`/`OAuthAccount`/`RefreshToken` モデル
  - `app/models/admin_user.py`: 管理者アカウントモデル
  - `app/core/*`: 設定・セキュリティ（JWT/ハッシュ）
  - `app/db/*`: SQLAlchemy Base とセッション
  - `alembic/*`: マイグレーション設定と初期スキーマ
  - `admin_register.py`: コマンドラインで管理者アカウントを追加
- `frontend/`: Next.js + NextAuth.js（App Router）
  - `app/(public)/*`: 匿名で閲覧できる画面（トップ/診断/ログイン/登録など）
  - `app/(auth)/*`: 認証必須画面（マイページ/セッション一覧）
  - `app/api/*`: Next.js Route Handler（NextAuth など）
  - `components/`, `lib/`, `styles/`, `tests/`
- `admin_front/`: Next.js 管理者コンソール（ログイン + JWT 表示）
  - `app/page.tsx`: ログイン画面
  - `app/dashboard/page.tsx`: JWT 表示・更新
  - `scripts/setup-hosts.sh`: `admin.localhost` を `/etc/hosts` に追加
  - `scripts/teardown-hosts.sh`: hosts 設定を除去

---

## 導入
### レポジトリのclone

```bash
git clone https://github.com/motoya0118/oni_coach_MVP.git
```

### backend

1) 環境変数の設定

`backend/env-sample/.env.example` をコピーして環境別ファイルを用意します。開発時は以下で十分です。
**#GEMINI_API_KEYは自身の所有するAPIキーを設定してください。他はデフォルト値のままでOKです。**

```
cp backend/env-sample/.env.example backend/.env.development
```

🔳 補足
`ENV=development` の場合は `.env.development` が自動で読み込まれます（`ENV` を変更すると `.env.staging` や `.env.production` が利用されます）。

### frontend
1) 環境変数の設定

環境変数は `frontend/env-sample/.env.example` を基に `.env.development` を作成します。

```
cp frontend/env-sample/.env.example frontend/.env.development
```
### admin_front
1) 環境変数の設定

`admin_front/env-sample/.env.example` をコピーして環境ファイルを準備します。

```
cp admin_front/env-sample/.env.example admin_front/.env.development
```

### docker起動後の初期設定
#### 1.docker環境起動

```bash
docker-compose up --build
```

#### 2. 管理者ユーザーの作成

FastAPI 側で管理者向け JWT を発行するには、`admin_users` テーブルに管理者アカウントを登録します。

```
docker exec -it app_backend bash
python scrips/admin_register.py <user_id> <password> --display-name "任意の表示名"
```

- `user_id` は管理者ログイン画面で利用する ID です（ユニーク制約あり）
- `--inactive` を付けると非アクティブ状態で作成できます
- 同じ `user_id` が存在する場合はエラーになります

---

#### 3. Seed データ（IT職種マスタ）をDBに反映する

`backend/scripts/seed/data/mst_ai_jobs_new.csv` を元に、`mst_ai_jobs` に初期データを投入できます。

- マイグレーションで `mst_ai_jobs` が作成されます（`alembic upgrade head` 実行済みであること）。
- 何度実行しても同名レコードは更新、未登録は追加されます（`name` を同一性キーとして扱います）。

```bash
#   CSV は docker-compose.yml で /data/_documents にマウントされます
docker compose exec backend \
  python /app/scripts/seed/script/seed_mst_ai_jobs.py \
  --csv /app/scripts/seed/data/mst_ai_jobs_new.csv
```

備考:
- コンテナ内実行時は `docker-compose.yml` で `_documents` を `/data/_documents` にマウント済みです。
- 既定では `--csv` を省略するとリポジトリ内の `backend/scripts/seed/data/mst_ai_jobs_new.csv` を参照します（ホスト/コンテナ共通）。

#### 4. DBに接続し、`diagnostics`テーブルにレコードを作成します
- code: ai_career # フロントエンドと密に連携してるカラム
- description: エンジニアキャリア診断
- outcome_table_name: mst_ai_jobs # 対応するマスタテーブルを指定するカラム


#### 5. `admin_front`画面から診断情報を登録する

1. [localhost:3100](http://localhost:3100)にアクセスします
2. `管理者ユーザーの作成`で作成したID, Passでログインします
3. 新規に診断版(バージョン)を作成します
4. リロードします # 実装がダメダメでごめんなさい
5. 作成したバージョンを指定して、[質問、選択肢、結果]を登録します`
   - `_documents/diagnostics/ai_career/diagnostic_template.xlsx`をアップロードし登録します
6. 作成したバージョンを指定して、`SYSTEM PROMPT`を登録します
  - `_documents/diagnostics/ai_career/llm_sample/sample_system_prompt.md`の内容をコピペして登録します
7. 版(バージョン)をフリーズします
8. 版(バージョン)をアクティブ版に指定します

### 動作確認
1. [診断開始画面](http://localhost:3000/diagnostics/ai_career)にアクセスします
2. `診断を開始`をクリックします
3. 質問を全て回答します
4. `回答を送信`をクリックします
5. ローディングが終わるまで待機します
6. 結果が表示されます
7. `おすすめ職種ランキング` -> `詳細を見る`をクリックします
8. 項目が日本語で全て埋まっていれば正しく動作しています


## API概要
### バックエンド API 概要（FastAPI）

- `POST /auth/register` — Email/Password で新規登録 → JWT + リフレッシュ発行
- `POST /auth/login` — Email/Password でログイン → JWT + リフレッシュ発行
- `POST /auth/oauth/github` — GitHub OAuth 連携
  - リクエストボディ: `{ code?: string, access_token?: string }`
  - `code`（推奨）または `access_token` のどちらかを指定
- `POST /auth/refresh` — リフレッシュトークンを照合し、JWT + リフレッシュをローテーション発行
- `POST /auth/logout` — リフレッシュトークンを無効化
- `GET /users/me` — `Authorization: Bearer <access_token>` で現在ユーザーを返却

アクセストークンの有効期限は 1 時間、リフレッシュトークンは 1 週間です。リフレッシュは都度ローテーションします。

#### 管理者向けエンドポイント

- `POST /admin_auth/login` — 管理者 `user_id` / `password` でアクセス/リフレッシュトークンを発行（アクセス 15 分）
- `POST /admin_auth/refresh` — リフレッシュトークンをボディに渡し、トークンをローテーション発行
- `POST /admin_auth/logout` — リフレッシュトークンを無効化
- `POST /admin_auth/logout_all` — ログイン中の管理者の全リフレッシュトークンを無効化
- `GET /admin_auth/me` — 管理者用アクセス トークンで現在の管理者情報を取得

### フロントエンド API 概要（Next.js Route Handlers）

- `GET /api/auth/[...nextauth]` — NextAuth のセッション取得などに利用（ログイン後のセッション参照）
- `POST /api/auth/[...nextauth]` — NextAuth のサインイン/コールバック処理に利用
- `POST /api/auth/register` — バックエンドの `/auth/register` を呼び出すラッパー
  - リクエストボディ: `{ email, password, remember_me?, device_id? }`
  - `remember_me` は未指定時 `true`
- `GET /api/master/versions` — バックエンドの `/master/versions` を取得（失敗時は空オブジェクトを返却）
- `GET /api/master/{key}` — バックエンドの `/master/{key}` を取得
  - `{key}` は `mst_` で始まるマスタ名のみ許可
  - 取得失敗時は `frontend/lib/data/staticMasters` から静的マスタにフォールバック
- `ANY /api/diagnostics/*` — 診断 API をバックエンドへプロキシ（GET/POST/PUT/PATCH/DELETE/HEAD）
- `GET /api/debug/session` — NextAuth セッションのデバッグ用（開発環境 or `ALLOW_DEBUG_SESSION=1` のときのみ）


## Test
### フロントエンドのユニットテスト

`frontend/tests/unit` 配下の Jest テストをコンテナ内で実行するコマンド例です。

```
# すべてのユニットテストを実行
docker compose run --rm frontend sh -lc "npm ci || npm install; npm test -- tests/unit"

# 単一ファイルのみ実行（例: validate-flow.test.js）
docker compose run --rm frontend sh -lc "npm ci || npm install; npm test -- tests/unit/validate-flow.test.js"

# ウォッチモード
docker compose run --rm frontend sh -lc "npm ci || npm install; npm run test:watch -- tests/unit"
```

### バックエンドのユニットテスト（DBを汚さない一時スキーマ方式）

バックエンドの統合テストは、Compose で用意した専用 MySQL (`db_test`) に接続し、`tests/conftest.py` が毎回ランダムな一時スキーマを作成して Alembic を適用します。テスト終了時にスキーマを DROP するため、本番/開発 DB のデータや AUTO_INCREMENT に影響を与えません。

- 実行コマンド（`ENV=test` で `.env.test` を読み込む）

```
ENV=test docker compose run --rm backend pytest -q
```

- テスト時の流れ
  - `ENV=test` で起動すると `backend/.env.test` が読み込まれ、`TEST_DATABASE_URL` が `db_test` コンテナを指す。
  - `tests/conftest.py` が `TEST_DATABASE_URL` を元に MySQL 上へ一時スキーマ（例: `test_ab12cd34`）を作成。
  - 一時スキーマに対して `alembic upgrade head` を適用し、テスト実行後に DROP。
  - `tests/utils/db.truncate_tables()` が AUTOCOMMIT の別接続でテーブルを TRUNCATE することで、各テストの前処理を高速化。

- 既存の MySQL を使いたい場合は `TEST_DATABASE_URL` を上書き可能です（例: `ENV=test docker compose run --rm -e TEST_DATABASE_URL=\"mysql+pymysql://user:pass@host:3306/app_test\" backend pytest`）。DROP 権限が無い場合はテスト専用 DB を手動で作成し、その URL を指定してください。

- 単体テストの実行例

```
ENV=test docker compose run --rm backend pytest -q tests/test_auth_register.py::test_register_success
```


## 環境別設定（develop / staging / production）

本プロジェクトは環境変数で向き先を切り替え、Compose のオーバーレイで環境ごとの差分を適用します。

- フロントのバックエンド向き先
  - クライアント側（ブラウザ）: `NEXT_PUBLIC_BACKEND_URL`
  - サーバー側（Next.js API/NextAuth 内）: `BACKEND_INTERNAL_URL`
  - 例（develop）: `NEXT_PUBLIC_BACKEND_URL=http://localhost:8000`, `BACKEND_INTERNAL_URL=http://backend:8000`
- バックエンドの CORS 許可
  - `CORS_ALLOWED_ORIGINS`（カンマ区切り）。未設定ならローカル `http://localhost:3000` 等を許可。
- DB 向き先
  - `DATABASE_URL`。Compose オーバーレイで環境ごとに上書き。

起動例

- develop（デフォルト）
  - `docker compose up --build`
  - バックエンド→内部 MySQL（サービス名 `db`）
  - フロント（ブラウザ）→`http://localhost:8000`、Next.js サーバー内→`http://backend:8000`

- staging（例）
  - 事前に外部DBのURLを設定: `export STAGING_DATABASE_URL='mysql+pymysql://user:pass@staging-mysql:3306/app'`
  - 起動: `docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build`
  - 主要上書き:
    - backend: `DATABASE_URL=${STAGING_DATABASE_URL}`、`CORS_ALLOWED_ORIGINS=https://staging.example.com,...`
    - frontend build args/env: `NEXT_PUBLIC_BACKEND_URL=https://api.staging.example.com`

- production（例）
  - `export PROD_DATABASE_URL='mysql+pymysql://user:pass@prod-mysql:3306/app'`
  - 起動: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build`
  - 主要上書き:
    - backend: `DATABASE_URL=${PROD_DATABASE_URL}`、`CORS_ALLOWED_ORIGINS=https://example.com,...`
    - frontend build args/env: `NEXT_PUBLIC_BACKEND_URL=https://api.example.com`
