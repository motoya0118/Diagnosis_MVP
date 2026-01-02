# マスタデータ運用ポリシー（暫定版）

## 0) 基本方針

* **Single Source of Truth**：業務系マスタは**DB**で管理（編集は管理画面経由・監査可）。
* **参照経路の統一**：フロントは\*\*Front API（Next.jsのRoute Handler）\*\*を必ず経由。

  * per-keyで **`static` / `api`** を切替可能（静的定数→APIへ昇格しやすい）。
* **初回ペイント保証**：**SSR/ISRで `<option>` を描画**し、クライアント側はSWRで追従（チラつき禁止）。

---

## 1) 命名規約 / 対象範囲

* **テーブル/ビュー名**：`mst_[a-z0-9_]+`（例：`mst_jobs`）

  * API公開対象はこのプレフィックスのみ。

---

## 2) バックエンドAPI（FastAPI）仕様

### エンドポイント

* `GET /master/{key}`：単体取得（必須）
* `GET /master/versions`：各`key`の最新バージョン/ETag一覧（必須）
* `GET /master/bundle?keys=a,b,c`：複数まとめ取得（任意・画面単位で使用）

### リクエスト制限

* `key`は **`mst_`で始まる英数アンダースコア大文字**のみ許可。違反は `403`。
* SQLは**識別子検証**＋**バインド**徹底（インジェクション対策）。

### レスポンス（共通フォーマット）

```json
{
  "key": "mst_jobs",
  "etag": "9c7e7b...",           // ハッシュ or version+timestamp
  "schema": [
    {"name":"code","db_type":"CHAR(2)","nullable":false},
    {"name":"name_ja","db_type":"VARCHAR(50)","nullable":false}
  ],
  "rows": [
    {"code":"13","name_ja":"東京都"}, ...
  ]
}
```

* **型表現ルール**

  * `BIGINT` / `DECIMAL` などJS安全域外は **文字列** で返す
  * `DATE/DATETIME/TIMESTAMP` は **ISO 8601文字列**
  * `ENUM/SET` は `schema.enum_values` を含められると親切
* **ETag/304**：`ETag` を付与。`If-None-Match`一致時は **304** を返す。
* **Cache-Control**：`public,max-age=60, s-maxage=300, stale-while-revalidate=300
* **多言語**：`?lang=ja|en` or `Vary: Accept-Language`（必要に応じて `name` エイリアス）。

### versionsの実装（推奨）

* `master_meta(table_name, version, updated_at)` を持ち、更新時に `version++`。
* `/master/versions` は `{ "MASTER_PREFS": "v12-1725760000", ... }` を返却。

---

## 3) フロント（Next.js）規約

### Front API（Route Handler）

* パス：`/api/master/[key]`（フロント唯一の窓口）
* 動作：

  1. ソース判定：`getSourceForKey(key)` → `"api"` or `"static"`
  2. `"api"`：`BACKEND_URL/master/{key}` を **そのまま透過**（ETag/304も転送）
  3. 失敗時 or `"static"`：**静的定数**へフォールバック（`ETag: "s-..."` 付与）
* 追加ヘッダ：`X-Master-Source: api|static`

### SSR/ISR & タグ

* サーバコンポーネントで `fetch('/api/master/mst_xxx', { next: { revalidate: 3600, tags: ['master:mst_xxx'] }})`
* 管理画面更新後：`revalidateTag('master:mst_xxx')` をWebhookで叩き**即時反映**。

### クライアント（SWR/React Query）

* `fallbackData` に **SSRの結果**を渡す（初回ペイント確定）。
* `dedupingInterval`（例 60s）で連打抑制。
* 任意で **IndexedDB** に最終成功結果を保存→**オフライン/遅延時も空白回避**。

### 並列数と通信

* 多数キー取得時は **同時実行数を制限**（例：12）。
* **/master/versions → 差分のみ取得**を基本に。

---

## 4) 静的定数（固定砲）

* ファイル：`app/_data/staticMasters.ts`
* 使い分けは `MASTER_SOURCE_*` 環境変数 or `MASTER_SOURCE` マップで制御。
* 静的定数にも簡易 `ETag` を付与し **immutable** キャッシュ可。

---

## 5) セキュリティ / 運用

* **Server Only**：DB接続は**バックエンド(fastapi)のみ**（Clientから直叩き禁止）。
* 秘密情報は `NEXT_PUBLIC_` を付けない。DB接続は**VPC/Private**＋**RDS Proxy**推奨。
* 監査・レート制限・バリデーション・書込みは**バックエンド（FastAPI）に集約**。
* Amplify Hosting：**再デプロイでCloudFrontキャッシュは切替**（手動一括Invalidateは不要前提）。
* ログ/監視：Front APIの**上流/下流の失敗率**と**フォールバック率**を可視化。

---


## 6) 追加・変更の手順（運用フロー）

1. **DB定義**を追加/変更（必要ならビューも作成）。
2. **master\_meta** 更新処理を実装（保存時に `version++`）。
3. 必要なら **静的定数** を暫定投入（`MASTER_SOURCE_*=static`）。
4. 準備でき次第 `MASTER_SOURCE_*=api` に切替。
5. 管理画面の保存処理で **NextのWebhook** を叩いて `revalidateTag`。
6. E2Eで **SSR初回ペイントに選択肢が出る**ことを確認。

---

## 7) 非機能要件（SLOの目安）

* 初回SSRの **空白表示：0**（必須）
* バンドル／差分同期時の **TTFB < 300ms（P50）**
* Front APIの**フォールバック（static）率 < 0.5%**（連続発生は要アラート）