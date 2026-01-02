# 03. 版テンプレートDL — GET /admin/diagnostics/versions/{version_id}/template

- 区分: Admin API（認可必須・管理者ロール）
- 目的: 設問・選択肢・Outcome 表示メタを Excel 形式でダウンロードし、オフライン編集の起点を提供する。

## エンドポイント
- Method: `GET`
- Path: `/admin/diagnostics/versions/{version_id}/template`
- Auth: `Bearer JWT`
- Response: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `Content-Disposition: attachment; filename="{diagnostic.code}_v{version_id|draft}.xlsx"`

### 特殊パス (`version_id = 0`)
- まだ版が存在しない診断向けに、`diagnostic_id` クエリパラメータ必須で初期テンプレートを生成する。
- Draft 版が存在する場合は最新 Draft をコピーして返却する。

## シート構成
| Sheet | 用途 | 列 | 備考 |
|-------|------|----|------|
| `questions` | 設問スナップショット | `q_code`, `display_text`, `multi`, `sort_order`, `is_active` | `multi`/`is_active` は `0/1`。`sort_order` は整数。 |
| `options` | 選択肢スナップショット | `q_code`, `opt_code`, `display_label`, `sort_order`,`llm_op`, `is_active` | `q_code` で `questions` を参照。 |
| `outcomes` | 結果表示メタ | Outcome マスタ列（`id`/`created_at`/`updated_at` を除く） + `sort_order`, `is_active` | 列セットは `diagnostics.outcome_table_name` から動的生成。 |

- ID 列は含めず、自然キー（`q_code`、`opt_code`、Outcome の `name` 等）で再インポートする。
- Draft 版では `is_active=1` を既定とし、不要な行は0に変更して一時的に非表示にできる。

## データソース
- `version_id > 0` の場合
  - `version_questions`, `version_options`, `version_outcomes` を参照。
  - `outcomes` シートは `outcome_meta_json` を展開し、元マスタ列の値をセルに出力。
- `version_id = 0` の場合
  - `questions`, `options`, Outcome マスタを診断IDで抽出（`is_active=1` のみ）。
  - `outcomes.sort_order` は `mst_ai_jobs.sort_order` 等マスタの順序をコピー。

## DB I/O
- `version_id > 0`
  ```sql
  SELECT d.code,
         dv.diagnostic_id
    FROM diagnostic_versions dv
    JOIN diagnostics d ON d.id = dv.diagnostic_id
   WHERE dv.id = :version_id;
  ```
  ```sql
  SELECT q_code,
         display_text,
         multi,
         sort_order,
         is_active
    FROM version_questions
   WHERE version_id = :version_id
   ORDER BY sort_order, id;
  ```
  ```sql
  SELECT vopt.q_code,
         vopt.opt_code,
         vopt.display_label,
         vopt.sort_order,
         vopt.llm_op,
         vopt.is_active
    FROM version_options vopt
    JOIN version_questions vq ON vq.id = vopt.version_question_id
   WHERE vopt.version_id = :version_id
   ORDER BY vq.sort_order, vopt.sort_order, vopt.id;
  ```
  ```sql
  SELECT outcome_id,
         sort_order,
         is_active,
         outcome_meta_json -- keyをヘッダーにしvalueを展開する
    FROM version_outcomes
   WHERE version_id = :version_id
   ORDER BY sort_order, outcome_id;
  ```
- `version_id = 0`
  ```sql
  SELECT d.code
    FROM diagnostics d
   WHERE d.id = :diagnostic_id;
  ```
  ```sql
  SELECT q.q_code,
         q.display_text,
         q.multi,
         q.sort_order,
         q.is_active
    FROM questions q
   WHERE q.diagnostic_id = :diagnostic_id
     AND q.is_active = 1
   ORDER BY q.sort_order, q.id;
  ```
  ```sql
  SELECT q.q_code,
         o.opt_code,
         o.display_label,
         o.sort_order,
         o.llm_op,
         o.is_active
    FROM options o
    JOIN questions q ON q.id = o.question_id
   WHERE q.diagnostic_id = :diagnostic_id
     AND o.is_active = 1
   ORDER BY q.q_code, o.sort_order, o.id;
  ```
  ```sql
  SELECT *
    FROM {diagnostics.outcome_table_name}
   WHERE is_active = 1
   ORDER BY sort_order, id;
  ```

## バリデーション
- `version_id > 0` かつ該当版が存在しない場合は 404 (`E010_VERSION_NOT_FOUND`)。
- `version_id = 0` の場合に `diagnostic_id` が無い/不正な場合は 400 (`E031_IMPORT_VALIDATION`) または 404 (`E001_DIAGNOSTIC_NOT_FOUND`)。
- Draft 版が Finalize 済みでもダウンロードは可能（参照用途）。

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | `version_id > 0` で版が存在しない |
| 404 | `E001_DIAGNOSTIC_NOT_FOUND` | `version_id = 0` かつ診断IDが存在しない |
| 400 | `E031_IMPORT_VALIDATION` | `version_id = 0` で `diagnostic_id` が未指定/不正 |

## テスト観点
1. **Draft 版テンプレート**: `DiagnosticVersionFactory` で Draft 版を作成し、対応する `VersionQuestionFactory` / `VersionOptionFactory` / `VersionOutcomeFactory` を投入。API を呼び出し、生成された Excel の各シートが DB 内容と一致することを検証。
2. **Finalize 版テンプレート**: `src_hash` が設定された版に対して API を呼び出し、`outcomes` シートのセルが `outcome_meta_json` の値を展開していることを確認。
3. **初期テンプレート**: 版未作成の診断に対し `version_id=0&diagnostic_id=...` で呼び出し、`questions`/`options` がカタログの `is_active=1` のレコードのみ含まれることを検証。
4. **無効ID**: 存在しない `version_id` で GET → 404 (`E010_VERSION_NOT_FOUND`) を確認。
