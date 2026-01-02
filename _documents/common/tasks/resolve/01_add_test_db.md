
# TODO
- [x] 本ドキュメントないの方針を理解する
- [x] docker-compose.ymlを修正する
  - [x] backendのテスト実行のみで起動するように設定
- [x] DBの接続先をテスト用DBに変更、及びテストDBを立ち上げる共通処理を作成する
  - [x] backend/tests
- [x] テスト実行コマンドを修正する
  - [x] README.md
- [x] 共通処理に加筆する
  - [x] _documents/common/backend/CommonFunctionality.md
- [x] 規約に追記する
  - [x] _documents/common/backend/implementation_guidelines.md

# 方針
結論：**本番/開発用DB と テスト用DBを分ける**
理由は「安全・再現性・速度」。既存データが混じるとロックや制約で落ちる／固まるため。

## なぜ分ける？

* **安全**：テストのTRUNCATE/DELETEが本番・開発データを壊すリスクをゼロに。
* **再現性**：テストは毎回“まっさら”で走らないと、たまたま通る/落ちるフレ flaky の温床。
* **速度**：テストDBは小さく・短命にして、作成→マイグレ→破棄を機械的に回すのが速い。

## 構成（MySQL想定）

1. **URLを分離（環境変数）**

```bash
# .env（開発）
DATABASE_URL="mysql+pymysql://user:pass@db/app"

# .env.test（テスト）
TEST_DATABASE_URL="mysql+pymysql://user:pass@db_test/app_test"
```

テストコードではすでに `DATABASE_URL or TEST_DATABASE_URL` 参照してるので、この2つを**別DB名/別コンテナ**にする。

2. **docker-composeでDBを2つ用意**

```yaml
services:
  db:
    image: mysql:8
    environment: [MYSQL_DATABASE=app, ...]
    volumes: [db_data:/var/lib/mysql]
  db_test:
    image: mysql:8
    environment: [MYSQL_DATABASE=app_test, ...]
    # 速さ重視なら tmpfs か名前付きの別ボリューム
    tmpfs: ["/var/lib/mysql:rw,noexec,nosuid,size=1g"]
volumes:
  db_data:
```

3. **テスト起動時の標準フロー**

```bash
# テストDBに対してだけ実行
alembic -x db=${TEST_DATABASE_URL} upgrade head
pytest -q
```

* `alembic.ini`で `sqlalchemy.url` を使わず、`-x db=...` でURLを差し替えると安全。
* CIなら `docker compose down -v` で**テストDBを毎回破棄**してOK。

4. **ガードレール**

* アプリ起動時に「`ENV=TEST` 以外で `TEST_DATABASE_URL` を使っていないか」チェック。
* `DATABASE_URL` に `prod` や外部ホストが入っていたら、テストプロセスを**即終了**するassertを入れる。



## 最低ラインの運用チェックリスト

* [ ] `DATABASE_URL` と `TEST_DATABASE_URL` は**必ず別**（名前もホストも分けるのが理想）。
* [ ] テスト前のデータ掃除は **別接続 + AUTOCOMMIT** で実施（TRUNCATE/`SET FOREIGN_KEY_CHECKS`は接続単位）。
* [ ] 可能なら **FKを `ON DELETE CASCADE`** に（親DELETEで子が自動清掃、ロック事故減）。
* [ ] 並列実行が絡むなら**テストDBをスキーマ毎に分ける**か**直列実行**。
* [ ] CIは毎回**テストDBを作って壊す**。
