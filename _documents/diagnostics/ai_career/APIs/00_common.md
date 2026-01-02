# 共通仕様（API全般）

## 1. 認証・権限
- **Admin API**: `Authorization: Bearer <JWT>`。クレーム `role=admin` を必須とし、認証エラーは 401 (`E401_UNAUTHORIZED`)、権限不足は 403 (`E403_FORBIDDEN`)。
- **User API**: 匿名アクセスを許容（診断実行はセッションコードで識別）。ログイン済みの場合は `Authorization` ヘッダーを付与するが必須ではない。
- すべてのレスポンスエラーは `{ "error_code": string, "message": string, "detail"?: object }` 形式で返却する。

## 2. 参照テーブル解決方針
- `diagnostics.outcome_table_name` で参照する Outcome マスタを決定する。
- 版スナップショットは `version_outcomes` の `outcome_meta_json` に保持する（例: `mst_ai_jobs` の `name` や `role_summary`）。
- Outcome マスタと `version_outcomes` の突き合わせは以下の順序で行う。
  1. `diagnostics.outcome_table_name` を大文字に正規化し、レジストリで対応する SQLAlchemy モデル/列を取得。
  2. `version_outcomes.outcome_meta_json` を優先（Finalize 時点のスナップショット）。
  3. 編集中にマスタを再参照したい場合のみ実テーブルを参照し直す。

```python
# registry.py
OUTCOME_MODELS = {
    "MST_AI_JOBS": (MstAiJob, MstAiJob.name),
    # 追加時はここに追記
}
```

## 3. version_options_hash の算出
- 目的: 同一診断版 + 同一回答集合を安定的にキャッシュキー化し、LLM 呼び出しをスキップする。
- 算出手順:
  1. `version_option_id` を昇順にソートした文字列リストを `",".join(...)` で結合。
  2. 文字列プレフィックスとして `"v{version_id}:"` を付与。
  3. `sha256` を計算し、16進小文字文字列を格納する。
- アプリ側は計算に使用した `version_option_id` 配列を `sessions.llm_result` の `debug` セクション等に保持しても良い（監査用途）。

## 4. キャッシュ・ETag
- **フォームAPI** (`GET /diagnostics/versions/{version_id}/form`): `ETag` に `diagnostic_versions.src_hash`（Finalize 時に確定）を使用し、`If-None-Match` に対応する。Finalize 前は `W/"draft-{version_id}-{updated_at}"` を返却。
- **結果API** (`POST /sessions/{session_code}/results`): 毎回バックエンドで `answer_choices` と `version_outcomes` を突き合わせて結果を生成する。サーバー側でのキャッシュは行わず、`version_options_hash` を用いたハッシュ検証のみ実施する。必要に応じて DB に `sessions.version_id`・`answer_choices.version_option_id` などの複合INDEXを付与して性能を確保する。
- CDN は長期パージを行わず、フォームレスポンスの TTL を 300 秒程度に設定して更新を反映する。

## 5. 監査ログ
- 版操作は `aud_diagnostic_version_logs` に記録し、`action` は `CREATE` / `IMPORT` / `FINALIZE` / `ACTIVATE` / `PROMPT_UPDATE` 等を利用。
- 管理者IDは JWT から取得し、`note` にクライアントIPや処理件数を残す。

## 6. エラーコード共通ルール
| Code | HTTP | 説明 |
|------|------|------|
| `E001_DIAGNOSTIC_NOT_FOUND` | 404 | 指定診断が存在しない |
| `E010_VERSION_NOT_FOUND` | 404 | 指定版が存在しない |
| `E002_VERSION_NAME_DUP` | 409 | 版名の一意制約違反 |
| `E011_STATUS_INVALID` | 400 | クエリパラメータ `status` が不正 |
| `E012_LIMIT_INVALID` | 400 | `limit` の指定が範囲外 |
| `E012_DIAGNOSTIC_MISMATCH` | 400 | 指定診断と版が一致しない |
| `E013_INVALID_FILTER` | 400 | クエリパラメータの組み合わせが不正 |
| `E020_VERSION_FROZEN` | 409 | Finalize 済み版に対して編集APIを呼んだ |
| `E021_INVALID_PAYLOAD` | 400 | リクエストボディの形式が不正 |
| `E022_OPTION_OUT_OF_VERSION` | 400 | セッション版に存在しない選択肢が指定された |
| `E030_NO_ANSWERS` | 400 | 回答が0件で結果を生成できない |
| `E033_SHEET_MISSING` | 400 | インポートテンプレに必須シートが無い |
| `E034_COL_MISSING` | 400 | インポートテンプレの列定義が不足 |
| `E030_DEP_MISSING` | 409 | Finalize 前提のデータが不足 |
| `E031_IMPORT_VALIDATION` | 400 | インポートファイルの検証エラー |
| `E040_SESSION_NOT_FOUND` | 404 | 指定セッションが存在しない/失効 |
| `E041_DUPLICATE_ANSWER` | 409 | 同一 `version_option_id` を重複登録 |
| `E042_HASH_MISMATCH` | 409 | `version_options_hash` とサーバー計算が一致しない |
| `E060_EMAIL_DUP` | 409 | メールアドレスが既に登録済み |
| `E061_WEAK_PASSWORD` | 400 | パスワードポリシー違反 |
| `E062_INVALID_SESSION_CODE` | 400 | 紐付け対象の `session_code` が存在しない |
| `E063_SESSION_OWNED_BY_OTHER` | 409 | 別ユーザーに紐付いたセッション |

-- これ以外のエラーは個別APIで定義する。エラーコードは後日、バックエンド全体で参照できる定義ファイル／ドキュメントを整備し、診断モジュール以外の API とも共通化する予定。

## 7. 日付・タイムゾーン
- すべて UTC で保存・返却する。API レスポンスは ISO8601 (`Z`) を基本とし、Excel 出力も UTC 時刻のままフォーマットする。

## 8. テスト共通
- factory_boy の `DiagnosticVersionFactory` 等は `diagnostic_versions` を基準にする。
