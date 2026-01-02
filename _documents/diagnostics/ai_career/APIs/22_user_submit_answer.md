# 22. 回答登録 — POST /sessions/{session_code}/answers

- 区分: User API
- 目的: 選択された `version_option_id` をセッションに紐付けて保存

## エンドポイント
- Method: `POST`
- Path: `/sessions/{session_code}/answers`
- Auth: 任意（匿名可）

## リクエストボディ
```json
{
  "version_option_ids": [9801],
  "answered_at": "2024-09-19T02:05:00Z"
}
```
- `version_option_ids` *(array, required, 1〜20 件まで)* — 版で定義された `version_options.id`。
- `answered_at` *(string|null)* — ISO8601。省略時はサーバ時刻。

## レスポンス
- 204 No Content

## バリデーション
- セッションが存在しない → 404 (`E040_SESSION_NOT_FOUND`)。
- `version_option_ids` が空 / 非数値 / 20件超 → 400 (`E021_INVALID_PAYLOAD`)。
- 指定された `version_option_id` がセッションの `version_id` と一致しない → 400 (`E022_OPTION_OUT_OF_VERSION`)。
- 既に同じ `version_option_id` が登録済み → 409 (`E041_DUPLICATE_ANSWER`)。

## 処理手順
1. `sessions` を `session_code` で取得し、`session_id` と `version_id` を確定。
   ```sql
   SELECT id, version_id
     FROM sessions
    WHERE session_code = :session_code;
   ```
2. `version_option_ids` を `version_options` で検証し、すべてが同一 `version_id` に属することを確認。取得件数が期待件数に満たない場合は 400 (`E022_OPTION_OUT_OF_VERSION`) を返す。
   ```sql
   SELECT id
     FROM version_options
    WHERE version_id = :version_id
      AND id IN (:version_option_ids);
   ```
3. 回答集合のハッシュを計算（ソート済み `version_option_id` を `','` で連結し SHA256）。
   ```python
   hash_input = ','.join(str(id) for id in sorted(version_option_ids))
   version_options_hash = sha256(hash_input.encode('utf-8')).hexdigest()
   ```
4. バルク `INSERT` で回答を登録。UK `(session_id, version_option_id)` により重複を防止。
   ```sql
   INSERT INTO answer_choices
           (session_id, version_option_id, answered_at)
   VALUES  (:session_id, :vo_id_1, COALESCE(:answered_at, NOW())),
           (:session_id, :vo_id_2, COALESCE(:answered_at, NOW()));
   ```
   - 一意制約違反 (`ER_DUP_ENTRY`) を検知して 409 (`E041_DUPLICATE_ANSWER`) に変換する。
5. `sessions.version_options_hash` をハッシュ値で更新。
    ```sql
    UPDATE sessions
       SET version_options_hash = :hash,
           updated_at = NOW()
     WHERE id = :session_id;
    ```

## エラーコード
| HTTP | Code | 条件 |
|------|------|------|
| 404 | `E040_SESSION_NOT_FOUND` | セッションが存在しない |
| 400 | `E021_INVALID_PAYLOAD` | `version_option_ids` が不正 |
| 400 | `E022_OPTION_OUT_OF_VERSION` | 指定選択肢が版に含まれない |
| 409 | `E041_DUPLICATE_ANSWER` | 同一選択肢を重複送信 |

## テスト観点
- **正常登録**
  1. `SessionFactory(version_id=...)` と `VersionOptionFactory` を用意し、`POST /sessions/{code}/answers` で `version_option_ids=[vo.id]` を送信して 204 が返ること、`answer_choices` にレコードが追加され `answered_at` が指定値または NOW で保存されることを確認。
- **存在しないセッション**
  1. 未登録の `session_code` を指定し、404 (`E040_SESSION_NOT_FOUND`) が返ることを検証。
- **版外選択肢**
  1. セッションの `version_id` と異なる `version_option_id` を含めて送信し、400 (`E022_OPTION_OUT_OF_VERSION`) が返り `answer_choices` が作成されないことを確認。
- **重複送信**
  1. 同じ `version_option_id` を2回送信し、2回目が 409 (`E041_DUPLICATE_ANSWER`) になることを検証。
- **並列投稿**
  1. 同一ペイロードを並列送信し、一方が成功、もう一方が一意制約違反により 409 となることを確認。
- **ハッシュ更新**
  1. 複数の `version_option_id` を送信し、レスポンス後に `sessions.version_options_hash` がソート済み集合から算出した SHA256 値に更新されていることを検証。
