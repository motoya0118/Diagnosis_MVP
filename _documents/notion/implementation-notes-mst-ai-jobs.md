# 実装メモ（mst_ai_jobs / Master API 連携）

このドキュメントは、今回追加したマスタ周り（DBマイグレーション、シード、バックエンドAPI、フロントFront API）の実装上のわかりにくいポイントと注意点をまとめたものです。

## 概要
- DBに `mst_ai_jobs`（AI職種マスタ）を追加。命名規約（mst_*, snake_case, InnoDB/utf8mb4）に準拠。
- Seedスクリプトで `backend/scripts/seed/data/mst_ai_jobs_new.csv` から挿入/更新（idempotent）。
- FastAPIに Master API（`/master/*`）を新設。ETag/304, Cache-Control 対応。
- Next.jsに Front API（`/api/master/*`）を新設。バックエンド透過＋失敗時は静的定数へフォールバック。

---

## DB / マイグレーション
- 追加テーブル: `mst_ai_jobs`
  - 主な列: `id (bigint unsigned autoincrement)`, `name`, `category`, `role_summary`, `main_role`, `collaboration_style`, `strength_areas`, `description`, `avg_salary_jpy`, `target_phase`, `core_skills`, `deliverables`, `pathway_detail`, `ai_tools`, `advice`, `is_active`(default 1), `sort_order`(default 0), `created_at`, `updated_at`
  - 制約: `pk_mst_ai_jobs`, `uq_mst_ai_jobs__name`
  - ストレージ/文字コード: `ENGINE=InnoDB`, `utf8mb4`, `utf8mb4_0900_ai_ci`
- 実装場所: `backend/alembic/versions/0001_create_auth_tables.py`
  - 初期マイグレーションに上書きで同梱（auth関連＋mst_ai_jobs）。
- 注意点:
  - `name` を業務キーとしてUQ。Seedはこれを同一性キーとして更新/挿入を振り分け。
  - `created_at`/`updated_at` は `CURRENT_TIMESTAMP(3)` 運用（MySQL 8）。
  - 今回はORMモデルは作成せず、Master APIはリフレクションでスキーマ/データを取得。

---

## Seed（CSV取り込み）
- スクリプト: `backend/scripts/seed/script/seed_mst_ai_jobs.py`
- 実行例（Docker Compose, コンテナ内）:
  ```sh
  docker compose exec backend \
    python /app/scripts/seed/script/seed_mst_ai_jobs.py \
    --csv /app/scripts/seed/data/mst_ai_jobs_new.csv
  ```
- CSV仕様（想定）:
  - 文字コード: `utf-8-sig`
  - 1行目はヘッダ（`カテゴリ`, `職種`, `要約`, `主な役割`, `関わり方`, `強みが必要な領域`, `平均年収`, `対象フェーズ`, `必要スキル`, `成果物`, `なるための経路`, `よく使うAIツール`, `特徴`, `目指す人へのアドバイス`）
  - マルチラインセル対応（DictReaderで読込）。
- ロジック:
  - 先に既存名一覧を取得し、既存=UPDATE / 新規=INSERT。
  - `is_active=True`, `sort_order` はCSVの順序で自動採番（1,2,3...）。
- 注意点:
  - `DATABASE_URL` はコンテナ内は環境変数で設定済み。ホストから直接実行する場合はローカルのDB URLが必要。
  - CSV列構成が変わる場合はスクリプトの列参照を合わせる。

---

## バックエンド（FastAPI）
- ルーター: `backend/app/routers/master.py`
- エンドポイント:
  - `GET /master/{key}`: 単体取得。
  - `GET /master/versions`: すべての `mst_%` テーブルのETag一覧。
  - `GET /master/bundle?keys=a,b,c`: 複数まとめ取得（任意）。
- 仕様/挙動:
  - `key` 検証: `^mst_[A-Za-z0-9_]+$`（違反は 403）。
  - テーブルはSQLAlchemyのメタデータを使ってリフレクション（ORMモデル不要）。
  - データ取得時の共通ルール: `is_active` があれば真のみ、`sort_order` があれば昇順。
  - レスポンス: `{ key, etag, schema[], rows[] }`。`schema.db_type` は MySQL方言で表記。
  - ETag: `schema+rows` の安定化JSONに対して SHA-1。`If-None-Match` 一致で 304。
  - Cache: `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=300`
  - `/master/versions`: `information_schema.tables` から `mst_%` を列挙→それぞれのETagを計算。
- 返却型に関する注意:
  - `DATETIME` は ISO8601 文字列。
  - `BIGINT/DECIMAL` 等はJSの安全域外の可能性があるため文字列に変換。
- セキュリティ:
  - DB接続はバックエンドのみ。キー正規表現で識別子を制限し、SQLはバインド使用。

---

## フロント（Next.js Front API）
- ルートハンドラ:
  - `frontend/app/api/master/[key]/route.ts`（単体透過 + フォールバック）
  - `frontend/app/api/master/versions/route.ts`（一覧透過）
- 透過時:
  - バックエンドの `ETag/304/Cache-Control` を尊重し、`X-Master-Source: api` を付与。
- フォールバック時:
  - `frontend/app/_data/staticMasters.ts` の定数を返却し、`X-Master-Source: static`。
  - `mst_ai_jobs` は空配列で用意（SSR空白崩れを防止）。
- SSR例:
  - `frontend/app/ai-jobs/page.tsx`: `/api/master/mst_ai_jobs` を `next.revalidate: 3600`＋タグ `master:mst_ai_jobs` で取得しSSR描画。
- 環境変数:
  - Front API → バックエンド透過に `BACKEND_INTERNAL_URL`（composeでは `http://backend:8000`）を使用。無い場合は `NEXT_PUBLIC_BACKEND_URL`。

---

## Docker Compose 連携
- `docker-compose.yml`
  - `backend` サービスに `_documents` を `/data/_documents:ro` でマウント（Seed用）。
  - `frontend` サービスに `BACKEND_INTERNAL_URL=http://backend:8000` を設定済み。
- 典型フロー:
  1) `docker compose up -d db backend frontend`
  2) `docker compose exec backend python /app/scripts/seed/script/seed_mst_ai_jobs.py --csv /app/scripts/seed/data/mst_ai_jobs_new.csv`
  3) `curl http://localhost:3000/api/master/mst_ai_jobs` で確認

---

## つまづきポイント / 注意
- CSVのヘッダは日本語列名で固定。列追加/リネーム時はスクリプトとマスタ列の整合が必要。
- CSVのマルチラインセル（説明など）を含むため、手編集時はフィールドのクォートに注意。
- ETagは`schema+rows`で計算されるため、並び順が変わるとETagも変わる。`sort_order` の管理が重要。
- `BIGINT/DECIMAL` は文字列化して返却するので、フロント側で数値演算する場合は明示的に変換が必要。
- Master APIはリフレクション依存のため、列の追加/型変更はAPIレスポンスに即時反映される（フロントの型定義との整合に注意）。
- `versions` は暫定実装（master_meta未導入）。将来的には保存時に `version++` して差分フェッチ/即時反映（`revalidateTag`）を行う。

---

## 動作確認のスニペット
- バックエンド（コンテナ内）:
  ```sh
  docker compose exec backend curl -sS http://localhost:8000/master/mst_ai_jobs | head -c 200
  docker compose exec backend curl -sS http://localhost:8000/master/versions
  ```
- フロントAPI（コンテナ内）:
  ```sh
  docker compose exec frontend sh -lc "apk add --no-cache curl >/dev/null 2>&1 || true; curl -sS http://localhost:3000/api/master/mst_ai_jobs | head -c 200"
  ```
- DB件数確認:
  ```sh
  docker compose exec db mysql -uapp -papp -e "SELECT COUNT(*) FROM app.mst_ai_jobs;"
  ```

---

## 今後の拡張
- `master_meta` テーブル導入（`key`, `version`, `updated_at`）とトリガ/アプリ更新での `version++`。
- 管理画面の保存処理で Next.js の Webhook（`revalidateTag('master:mst_ai_jobs')`）呼び出し。
- `mst_ai_jobs` へ `code` 列導入（業務キーを明確化）や、`name` 多言語化方針の決定。
- APIの`bundle`を画面単位で活用し、初回リクエスト数を削減。
