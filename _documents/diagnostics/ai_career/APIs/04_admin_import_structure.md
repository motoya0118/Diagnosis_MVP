# 04. 版スナップショット取込 — POST /admin/diagnostics/versions/{version_id}/structure/import

- 区分: Admin API（認可必須・管理者ロール）
- 目的: テンプレートXLSXから Draft 版の設問・選択肢・Outcome メタを一括取り込みする。

## エンドポイント
- Method: `POST`
- Path: `/admin/diagnostics/versions/{version_id}/structure/import`
- Auth: `Bearer JWT`
- Request: `multipart/form-data`
  - `file`: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`（必須）

## 前提条件
- 対象版は **Draft**（`diagnostic_versions.src_hash IS NULL`）。Finalized 版に対して呼び出すと 409 (`E020_VERSION_FROZEN`)。
- テンプレート構造は `03_admin_get_template.md` のシート・列定義に従う。

## 入力検証
1. シート存在チェック
   - 必須: `questions`, `options`, `outcomes`
   - 欠落: 400 (`E033_SHEET_MISSING`)
2. ヘッダ検証
   - 期待列と一致しない場合は 400 (`E034_COL_MISSING`)
3. 行検証
   - `q_code`/`opt_code` は必須、長さ 1〜64。
   - `multi`/`is_active` は `0|1`。整合しない場合 400 (`E031_IMPORT_VALIDATION`).
   - `sort_order` は整数。
   - Outcome シートのキー列（例: `name`）は空不可。`OUTCOME_MODELS` に登録された一意キーで照合。

検証エラーは Excel のセル位置（例: `questions!B12`）を `detail.invalid_cells[]` に含めて返却する。

## 取込フロー（トランザクション内）
1. 版情報取得
   ```sql
   SELECT diagnostic_id
     FROM diagnostic_versions
    WHERE id = :version_id
      FOR UPDATE;
   ```
2. 質問カタログ同期
   - `questions` テーブルを `diagnostic_id + q_code` で UPSERT。
   - Draft 版の既存 `version_questions` を `DELETE` → 取込行を `INSERT`（`created_by_admin_id` はリクエスト管理者）。

   ```sql
   INSERT INTO questions
     (diagnostic_id, q_code, display_text, multi, sort_order, is_active, created_at, updated_at)
   VALUES
     (:diagnostic_id, :q_code, :display_text, :multi, :sort_order, :is_active, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     display_text = VALUES(display_text),
     multi        = VALUES(multi),
     sort_order   = VALUES(sort_order),
     is_active    = VALUES(is_active),
     updated_at   = NOW();

   DELETE FROM version_questions WHERE version_id = :version_id;

   INSERT INTO version_questions
     (version_id, diagnostic_id, question_id, q_code, display_text, multi, sort_order, is_active,
      created_by_admin_id, created_at, updated_at)
   VALUES
     (:version_id, :diagnostic_id, :question_id, :q_code, :display_text, :multi, :sort_order, :is_active,
      :admin_id, NOW(), NOW());
   ```

3. 選択肢カタログ同期
   - `options` テーブルを `(question_id, opt_code)` で UPSERT（`question_id` は上記で解決）。
   - `version_options` を `DELETE` → 行ごとに `INSERT`（`is_active`, `sort_order`, `display_label` をコピー）。`version_question_id` は同一版の `version_questions.id` を紐付けに利用する。

   ```sql
   INSERT INTO options
     (question_id, opt_code, display_label, sort_order, llm_op,is_active, created_at, updated_at)
   VALUES
     (:question_id, :opt_code, :display_label, :sort_order, :llm_op,:is_active, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     display_label = VALUES(display_label),
     sort_order    = VALUES(sort_order),
     llm_op        = VALUES(llm_op),
     is_active     = VALUES(is_active),
     updated_at    = NOW();

   DELETE FROM version_options WHERE version_id = :version_id;

   INSERT INTO version_options
     (version_id, version_question_id, option_id, opt_code, display_label, sort_order, llm_op, is_active,
      created_by_admin_id, created_at, updated_at)
   VALUES
     (:version_id, :version_question_id, :option_id, :opt_code, :display_label, :sort_order, :llm_op, :is_active,
      :admin_id, NOW(), NOW());
   ```

4. Outcome メタ同期
   - Outcome マスタ（例: `mst_ai_jobs`）をキー列で UPSERT。
   - `version_outcomes` を `DELETE` → 行ごとに `INSERT`。マスタ行を JSON 化して `outcome_meta_json` に格納。

   ```sql
   -- 取得した列を用いて UPSERT する（例: mst_ai_jobs の場合）。
   INSERT INTO {outcome_table_name}
     ({excelのヘッダー名}, created_at, updated_at)
   VALUES
     ({excelのヘッダーに対応するbody}, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     {excelのヘッダーに対応するbody},
     updated_at = NOW();

   DELETE FROM version_outcomes WHERE version_id = :version_id;

   INSERT INTO version_outcomes
     (version_id, outcome_id, sort_order, is_active, outcome_meta_json,
      created_by_admin_id, created_at, updated_at)
   VALUES
     (:version_id, :outcome_id, :sort_order, :is_active, :outcome_meta_json,
      :admin_id, NOW(), NOW());
   ```

5. 監査
   - `aud_diagnostic_version_logs` に `action='IMPORT'`、`note` に各シートの件数を記録。

   ```sql
   INSERT INTO aud_diagnostic_version_logs
     (version_id, admin_user_id, action, new_value, note, created_at)
   VALUES
     (:version_id, :admin_id, 'IMPORT',
      JSON_OBJECT('questions', :questions_count,
                  'options', :options_count,
                  'outcomes', :outcomes_count,
                  'warnings', :warnings_json),
      NULL, NOW());
   ```

## レスポンス
- 200 OK
```json
{
  "version_id": 42,
  "questions_imported": 18,
  "options_imported": 72,
  "outcomes_imported": 12,
  "warnings": []
}
```
- 警告（例: Outcome マスタが新規に増えた場合）は `warnings` に文字列配列で返す。

## エラーコード
| HTTP | Code | 説明 |
|------|------|------|
| 404 | `E010_VERSION_NOT_FOUND` | 版が存在しない |
| 409 | `E020_VERSION_FROZEN` | Finalize 済み |
| 400 | `E033_SHEET_MISSING` | 必須シート不足 |
| 400 | `E034_COL_MISSING` | ヘッダ不足 |
| 400 | `E031_IMPORT_VALIDATION` | セル値不正 |

## テスト観点
- **正常取り込み**
  1. `DiagnosticVersionFactory(src_hash=NULL)` で Draft 版を作成し、対応する `VersionQuestionFactory` / `VersionOptionFactory` / `VersionOutcomeFactory` を初期投入。
  2. テストでは Excel ファイルを生成せず、`seed_import_rows()` ヘルパで `questions` / `options` / `outcomes` のモックデータを用意し、Excel パーサをスタブして該当データを返すようにする。
  3. API を呼び出し、レスポンスが 200 かつ `questions_imported`・`options_imported`・`outcomes_imported` がモックデータの件数と一致することを検証。
  4. DB の `version_questions` / `version_options` / `version_outcomes` が新内容に置き換わり、`aud_diagnostic_version_logs` に `action='IMPORT'` のレコードが追加されていることを検証。
- **Finalize 済み版**
  1. 上記 Draft を `src_hash` 付きで更新し Finalize 状態にする。
  2. 同じモックデータを渡して API を呼び出すと 409 (`E020_VERSION_FROZEN`) が返り、テーブルに変更が無いことを確認。
- **シート欠落**
  1. Excel 生成の代わりに `seed_import_rows()` で `questions` データを空配列にしたモックを返すようスタブし、400 (`E033_SHEET_MISSING`) とセル位置情報が返ることを確認。
- **ヘッダー不一致**
  1. `seed_import_rows()` の `outcomes` 配列に存在しない列名を含め、ヘッダー検証フェーズで information_schema の結果と一致しないようスタブする。
  2. API を呼び出し、400 (`E034_COL_MISSING`) が返り `detail.invalid_cells` に該当列名が記録されることを確認。
- **Outcome マスタ不整合**
  1. `outcomes` 配列にマスタ未登録の行を含めたモックを返すようにし、事前検証フェーズでキーが解決できず 400 (`E031_IMPORT_VALIDATION`) を返すことを確認する。マスタの追加やカラム構成変更は必ずマイグレーションで管理するため、このケースはエラーとする。
- **監査内容**
  1. 正常ケースの後、`aud_diagnostic_version_logs.new_value` に取込件数と警告が JSON で記録されていることを検証。
- **トランザクション整合**
  1. インポート途中で `options` の UPSERT を強制的に失敗（例: スタブで例外を投げる）させるテストを用意し、全処理がロールバックされ `version_questions` / `version_options` / `version_outcomes` が元の状態のまま維持されていることを確認する。
