# エラーコード管理ガイド（FastAPI 共通指針）

本ドキュメントは、Avanti のバックエンド（FastAPI）とフロントエンド（Next.js ほか）双方でエラーコードを一元管理し、API 利用者と開発者の双方にとって一貫したエラー設計を提供するための指針です。診断モジュールを含む全バックエンド API、ならびにクライアント実装で共通運用します。

## 1. 基本方針
- **一意性**: エラーコードはサービス全体で重複させない。`E{領域}{番号}` 形式（例: `E01xxx` は診断モジュール、`E10xxx` は認証など）で体系化する。
- **安定性**: 公開後はコードの意味を変更しない。新しい意味が必要な場合は新コードを追加する。
- **トレーサビリティ**: 各エラーコードは仕様書・ソースコード・テストケースと紐付けられるようにし、検索しやすい状態を維持する。

## 2. 命名規則
- プレフィックスは必ず `E`（エラー）で始める。
- 3〜5 桁の数値を付与し、領域ごとに桁を割り当てる。例:
  - `E00100`〜`E00199`: 診断ドメイン共通
  - `E01000`〜`E01999`: 認証/ユーザー管理
  - `E02000`〜`E02999`: 決済
- 既存運用で 5 桁未満のコードがある場合も後方互換性を維持しつつ、新規追加は 5 桁標準とする。

## 3. エラーコード定義ソース（YAML）
- 各プロジェクトのルート直下に `error_codes.yaml` を配置する（例: `backend/error_codes.yaml`, `frontend/error_codes.yaml`）。
- YAML は以下のスキーマに従う。`prefix` と `code` を連結して正式なエラーコード（例: `E00` + `100` → `E00100`）を生成する。

```yaml
# backend/error_codes.yaml
version: 1
domains:
  diagnostic:
    prefix: E00
    errors:
      NOT_FOUND:
        code: "100"
        http: 404
        message: "指定診断が存在しない"
      ALREADY_ANSWERED:
        code: "101"
        http: 409
        message: "診断は既に回答済みです"
  auth:
    prefix: E10
    errors:
      USER_NOT_FOUND:
        code: "000"
        http: 404
        message: "指定ユーザーが存在しない"
      EMAIL_DUPLICATE:
        code: "060"
        http: 409
        message: "メールが既に登録済み"
  payment:
    prefix: E20
    errors:
      GATEWAY_TIMEOUT:
        code: "001"
        http: 504
        message: "決済ゲートウェイの応答がタイムアウトしました"
```

```yaml
# frontend/error_codes.yaml
version: 1
domains:
  diagnostic:
    prefix: E00
    errors:
      NOT_FOUND:
        code: "100"
        ui_message: "診断が見つかりません"
        action: "トップへ戻る"
      ALREADY_ANSWERED:
        code: "101"
        ui_message: "診断はすでに完了しています"
        action: "結果ページを開く"
  auth:
    prefix: E10
    errors:
      USER_NOT_FOUND:
        code: "000"
        ui_message: "ユーザーが見つかりません"
        action: "ログイン情報を確認"
      EMAIL_DUPLICATE:
        code: "060"
        ui_message: "このメールはすでに登録されています"
        action: "ログイン画面へ"
```

- バックエンド/フロントエンドで同じ `domains` と `code` を共有しつつ、プロジェクト固有の属性（`http`, `message`, `ui_message` など）を持たせる。
- YAML 更新は Pull Request で行い、コード生成タスクとドキュメント修正を同時に行う。

## 4. CI/CD によるコード生成
- GitHub Actions（または社内 CI）で以下を自動化する。
  1. YAML スキーマ検証（`jsonschema` など）。
  2. Enum/定数生成スクリプトの実行。
     - バックエンド: `backend/scripts/generate_error_codes.py` → `backend/common/errors.py` を上書き。
     - フロントエンド: `frontend/scripts/generateErrorCodes.ts` → `frontend/src/constants/errorCodes.ts` を生成。
  3. 差分が出た場合は CI を失敗させ、開発者に生成物のコミットを促す。
- ローカルでも `make generate-error-codes`（仮）で同処理を実行できるようにする。

```bash
# 例: backend/scripts/generate_error_codes.py
python -m tools.generate_error_codes backend/error_codes.yaml backend/common/errors.py
```

- 生成物は lint/format の対象とし、品質ゲートに組み込む。

## 5. ドキュメント管理
- 本書を基点として、各 API 設計書から参照する。
- 各 API ドキュメントには次の記法で紐付ける:
  - 「利用するエラーコード: `E001`, `E010`, ...」
  - 詳細は本ドキュメントの「エラーコード一覧」を参照する旨を明記。
- エラーコード一覧は本書内に表形式で整理し、Git リポジトリ上でレビューしやすい構造に保つ。

| Code | HTTP | 説明 | ドメイン |
|------|------|------|----------|
| `E001` | 404 | 指定診断が存在しない | 診断 |
| `E010` | 404 | 指定版が存在しない | 診断 |
| `E060` | 409 | メールが既に登録済み | 認証 |

## 6. 実装アプローチ
### 6.1 バックエンド（FastAPI）
- 生成された `backend/common/errors.py` をインポートし、`raise_error`（生成時に同梱）で統一レスポンスを返す。
- ドメイン特化の例外が必要な場合は `BaseAppException` を実装し、`ErrorCode` を保持させる。
- 起動時に `app.add_exception_handler(BaseAppException, handler_fn)` を登録して JSON 形式を統一する。

### 6.2 フロントエンド
- CI で生成された `errorCodes.ts` を利用し、API クライアントや UI でコードを解釈する。
- フロント側ではコードに応じたメッセージ・リカバリアクションを定義し、UI コンポーネントで再利用する。

### 6.3 Pydantic / クライアントバリデーション
- バックエンドの入力バリデーションは FastAPI 標準レスポンスを利用。
- ビジネスバリデーションは `raise_error(ErrorCode.E021_INVALID_PAYLOAD, ...)` のように明示し、フロントは同コードで判定する。

## 7. 運用フロー
1. **追加要望**: 新エラーが必要な場合、PR で `ErrorCode` Enum とドキュメントを更新する。
2. **レビュー**: ドメイン担当と横断チームで番号重複・説明の重複をチェック。
3. **リリース**: コードとドキュメントの整合を確認し、クライアントへの影響がある場合はリリースノートに明記する。

## 8. 運用ツール（今後のタスク）
- CLI（例: `scripts/check_error_codes.py`）で Enum とドキュメントの整合性チェックを自動化する。
- GitHub Actions に整合性テストを組み込み、PR 時に差分検知を行う。

## 9. FAQ
- **Q: 既存コードを変更したい場合?**
  - 原則不可。新コードを追加し、旧コードは「非推奨」として残す。
- **Q: HTTP 500 を返すケースは?**
  - 未定義例外は `E999_UNEXPECTED` を追加し、監視に通知する。
- **Q: 外部サービス連携エラーは?**
  - 連携先ごとに番号帯を確保し、どの外部サービスで発生したか判別できるようにする。

---

この指針に基づき、FastAPI ベースの各サービスでエラーコード運用を統一し、仕様書・テスト・監視までの一貫性を担保する。
