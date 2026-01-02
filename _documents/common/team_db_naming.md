# Team DB Naming Guide — **MySQL版**

## 0. 方針（流派固定）

* すべて **小文字 + `snake_case`**。
* **テーブル＝複数形**、**列＝単数形**。
* 主キーは `id`、外部キーは `<entity>_id`。
* 予約語・混在大小・多重アンダースコア・絵文字・スペース禁止。
* **常に小文字**（`lower_case_table_names` 依存回避）。
* ストレージは **InnoDB** 固定。文字コード **utf8mb4**、照合順序 **utf8mb4\_0900\_ai\_ci**（日本語検索要件キツいなら `*_ja_0900_as_cs` を検討）。

> 参考流派：Mozilla / GitLab に寄せつつ、MySQLの制約（インデックス名64文字など）を明文化。

---

## 1. テーブルカテゴリ & プレフィックス

| カテゴリ       | 目的         | 推奨Prefix         | 命名例                | 備考                            |
| ---------- | ---------- | ---------------- | ------------------ | ----------------------------- |
| **マスタ**    | 低頻度更新・参照中心 | `mst_`  | `mst_countries`    | `id`（サロゲート）+ `*_code`（業務キーUQ） |
| **業務**     | 受注/応募/申請など | （本プロジェクトは無し） | `orders`          | 監査列を標準装備                      |
| **関連（中間）** | 多対多        | （本プロジェクトは無し）  | `users_roles`  | 名は**辞書順**、複合PK or UQ          |
| **設定**     | システム設定     | `cfg_`           | `cfg_features`     | フラグは `is_/has_`               |
| **監査/履歴**  | 変更履歴/イベント  | `aud_` / `hist_` | `aud_order_events` | `aud_` は append-only          |
| **キュー**    | 非同期/リトライ   | `q_`             | `q_mail_outbox`    | 可視期限・冪等キー                     |
| **ステージング** | 取込前置場      | `stg_` / `tmp_`  | `stg_job_imports`  | TTL/掃除ジョブ必須                   |

※ このプロジェクトではクラス名と整合させるため、業務テーブルへの `biz_` プレフィックスは使いません（テーブルは複数形の snake_case: 例 `users`, `orders`）。`mst_`/`lnk_`/`aud_` などは従来どおり採用します。仕訳/高頻度ジャーナルを導入する場合は `txn_` を別途検討してください。

---

## 2. 列の命名・型・既定

* 真偽: `is_active`（`boolean` = `tinyint(1)` エイリアス）**NOT NULL DEFAULT 0**
* タイムスタンプ: `created_at`, `updated_at`, `deleted_at`（採用時）

  * 型は **`datetime(3)`**、**UTC保存**、DB `time_zone='UTC'`。アプリでTZ変換。
* 監査: `created_by`, `updated_by`（`bigint` の `user_id` 或いは `varchar(191)` サービス名）
* 金額/数量: `decimal(18,2)` など単位明記（例: `amount_jpy`）
* JSON拡張: `extra_json`（`json` 型、乱用しない）
* 文字列は基本 `varchar(191)`（InnoDB + utf8mb4 の **index 長制限**を踏まえた無難値）

---

## 3. ID方式

### 連番ID

```sql
id bigint unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY
```

* 長所: シンプル・小さい・インデックス局所化良。
* 注意: 推測可能性/件数露出、シャーディング計画があるなら後方互換を考える。

---

## 4. 制約・インデックスの命名

* PK：`pk_<table>`（例 `pk_mst_countries`）
* FK：`fk_<table>__<ref_table>`（例 `fk_orders__users`）
* UQ：`uq_<table>__<col1>[_<col2>]`
* IDX：`idx_<table>__<col1>[_<col2>]`
* CK：`ck_<table>__<desc>`（MySQLは CHECK が落ちる版もあるが8.0はOK）

**注意**: **インデックス名は64文字上限**。超えそうなら

* テーブル名は24文字まで、列名は16文字までに**省略**（母音削除や略語ポリシーをチーム内で固定）。

**設計原則（鉄則3つ）**

1. クエリの `WHERE a=? AND b=? ORDER BY c` は `(a,b,c)` の複合索引を付ける
2. 業務キー（`*_code`）には **必ずUQ**
3. 外部キー列には **対応する単独IDX** or **複合IDX先頭**を用意

---

## 5. 外部キー運用

* 基本 **ON**。参照整合性をDBで担保。
* NULL可の任意関係はできるだけ **別テーブルで表現**。どうしても同居させるなら `nullable` にし、`ck_` で論理整合。

---

## 6. 多対多（リンク）テーブル

* 名称：`<a_plural>_<b_plural>`（**辞書順**）
* **シンプル**: 主キー = `(a_id, b_id)`（複合PK）
* **属性付き**（重み/期間など）: `id`（連番/UUID）をPKにし、`unique(a_id,b_id)` を置く

---

## 7. 監査・イベント・キュー

* 監査列（業務テーブル共通）:
  `created_at datetime(3) not null`, `created_by ...`, `updated_at datetime(3) not null`, `updated_by ...`
* イベント（`aud_`）: `append-only`、`occurred_at datetime(3) not null`, `idempotency_key varchar(191)` + `uq`
* キュー（`q_`）標準列案：
  `status`（ready/processing/done/err）、`visibility_deadline_at datetime(3)`, `attempts int`, `next_attempt_at datetime(3)`, `idempotency_key`, `error_code`, `error_message`

  * 取得クエリ前提の **複合IDX**：`idx_q__status_visibility (status, visibility_deadline_at)`

---

## 8. ソフトデリート/履歴

* **原則** マスタは論理削除なし。無効化は `is_active`。
* 業務でソフトデリートが必要な場合のみ `deleted_at datetime(3)`。
* スナップショットは `hist_`（SCD Type2風: `valid_from/valid_to`）を採用。

---

## 9. DWH派生（任意）

* 次元：`dim_`（`id`, `*_code`, SCD方針明記）
* ファクト：`fact_`（append-only、単位を命名で明示：`*_count`, `*_amount_jpy`）

---

## 10. MySQLサーバ設定（推奨）

* `sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'`
* `time_zone='UTC'`
* `character_set_server=utf8mb4`, `collation_server=utf8mb4_0900_ai_ci`
* バイナリログ有効（監査・CDC想定なら）

---

# 例：**最小セットDDL（連番ID版）**

```sql
-- country master
CREATE TABLE mst_countries (
  id           bigint unsigned NOT NULL AUTO_INCREMENT,
  code         varchar(64)     NOT NULL,
  name         varchar(191)    NOT NULL,
  is_active    boolean         NOT NULL DEFAULT 1,
  sort_order   int             NOT NULL DEFAULT 0,
  created_at   datetime(3)     NOT NULL,
  updated_at   datetime(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mst_countries__code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- job category master
CREATE TABLE mst_job_categories (
  id           bigint unsigned NOT NULL AUTO_INCREMENT,
  code         varchar(64)     NOT NULL,
  name         varchar(191)    NOT NULL,
  is_active    boolean         NOT NULL DEFAULT 1,
  sort_order   int             NOT NULL DEFAULT 0,
  created_at   datetime(3)     NOT NULL,
  updated_at   datetime(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mst_job_categories__code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- users (業務)
CREATE TABLE users (
  id           bigint unsigned NOT NULL AUTO_INCREMENT,
  email        varchar(191)    NOT NULL,
  password_hash varchar(191)   NOT NULL,
  is_active    boolean         NOT NULL DEFAULT 1,
  created_at   datetime(3)     NOT NULL,
  updated_at   datetime(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users__email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- companies (業務)
CREATE TABLE companies (
  id           bigint unsigned NOT NULL AUTO_INCREMENT,
  name         varchar(191)    NOT NULL,
  country_id   bigint unsigned NOT NULL,
  created_at   datetime(3)     NOT NULL,
  updated_at   datetime(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_companies__country_id (country_id),
  CONSTRAINT fk_companies__mst_countries
    FOREIGN KEY (country_id) REFERENCES mst_countries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- jobs (業務)
CREATE TABLE jobs (
  id              bigint unsigned NOT NULL AUTO_INCREMENT,
  company_id      bigint unsigned NOT NULL,
  job_category_id bigint unsigned NOT NULL,
  title           varchar(191)    NOT NULL,
  description     text            NOT NULL,
  status          varchar(64)     NOT NULL, -- enum管理 or lkp参照
  created_at      datetime(3)     NOT NULL,
  updated_at      datetime(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_jobs__company_id (company_id),
  KEY idx_jobs__job_category_id (job_category_id),
  KEY idx_jobs__company_id_status (company_id, status),
  CONSTRAINT fk_jobs__companies
    FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_jobs__mst_job_categories
    FOREIGN KEY (job_category_id) REFERENCES mst_job_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- users x jobs (多対多: 応募など）
CREATE TABLE lnk_users_jobs (
  user_id     bigint unsigned NOT NULL,
  job_id      bigint unsigned NOT NULL,
  created_at  datetime(3)     NOT NULL,
  PRIMARY KEY (user_id, job_id),
  KEY idx_lnk_users_jobs__job_id (job_id),
  CONSTRAINT fk_lnk_users_jobs__users
    FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_lnk_users_jobs__jobs
    FOREIGN KEY (job_id) REFERENCES jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- job events (監査/イベント)
CREATE TABLE aud_job_events (
  id             bigint unsigned NOT NULL AUTO_INCREMENT,
  job_id         bigint unsigned NOT NULL,
  event_type     varchar(64)     NOT NULL,
  payload_json   json            NULL,
  occurred_at    datetime(3)     NOT NULL,
  idempotency_key varchar(191)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_aud_job_events__idempotency_key (idempotency_key),
  KEY idx_aud_job_events__job_id_occurred_at (job_id, occurred_at),
  CONSTRAINT fk_aud_job_events__jobs
    FOREIGN KEY (job_id) REFERENCES jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

# 運用Tips（MySQLならでは）

* **複合インデックス**は順序が命。`WHERE` → `ORDER BY` の順で左から並べる。
* 大量`INSERT`時は **バルク**＋**`innodb_flush_log_at_trx_commit=2`**（可用性要件に応じて）。
* 文字列UQは 191 文字以内推奨（インデックス長制限回避）。
* `EXPLAIN ANALYZE` で実行計画を日常的に確認。遅いならまず索引見直し。
* バックアップ/復旧は **mysqldump + xtrabackup** などで定期運用。
