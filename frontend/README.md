# Avanti Front — AIビジネスパーソン診断チャート

Next.js(App Router) で実装した「最大10階層」の診断アプリです。1問/1画面で分岐し、結果カードには職種タグ・根拠・推奨アクション・職種詳細（役割/年収/スキル/なる経路）を表示します。

## 導入（ローカル開発）

- 前提
  - Node: 18.17+（推奨: 20.x）
  - npm: 9 以降（推奨: 10.x）
  - Git, (任意) AWS CLI（リリース用）

- セットアップ
  - リポジトリ取得: `git clone <your_repo_url>` → `cd front`
  - Node バージョン確認: `node -v`（20.x 推奨）
    - もし古い場合は nvm などで切替: `nvm install 20 && nvm use 20`
  - 依存インストール: `npm i`

- 起動/ビルド
  - 開発起動: `npm run dev` → `http://localhost:5173`
  - 型/型定義の自動導入プロンプトが出たら「Yes」を選択、もしくは手動で `npm i -D typescript @types/react @types/node`
  - 本番ビルド: `npm run build`
  - 本番サーバ: `npm run start`（SSR サーバ起動）

- 確認用スクリプト（テスト）
  - 分岐検証/経路出力: `npm run validate`
    - Dead-ends（到達不可ノード）検出
    - 各職種への到達経路（Q=選択肢）を表示
    - `results` に存在し、質問から到達できない孤立キーがあれば検出してエラー終了

- 補足
  - ローカル確認のみなら、静的プロトタイプ版 `index.html` は不要です（Next.js に移行済み）。削除して問題ありません。
  - ロックファイル: `package-lock.json` はコミット推奨（依存の再現性のため）。
  - エラーコード定義を変更した際は `npm run generate:error-codes` を実行して `lib/error-codes.ts` を再生成してください。

## リリース（Amazon S3 + CloudFront 配信）

S3 は静的ホスティングのため、SSR ではなく「静的エクスポート」で公開します。

- 1) 設定変更（静的エクスポート有効化）
  - `next.config.js` に以下を追加/変更
    
    ```js
    /** @type {import('next').NextConfig} */
    const nextConfig = {
      reactStrictMode: true,
      output: 'export', // 追加: 静的エクスポート
    };
    module.exports = nextConfig;
    ```
  - npm スクリプト（任意）
    - `package.json` に `"export": "next build && next export"` を追加すると便利です。

- 2) ビルド＆エクスポート
  - `npm run build`
  - `npx next export`（または `npm run export`）
  - 静的ファイルは `out/` に生成されます

- 3) S3 バケットへ配置
  - 前提: AWS CLI が認証済み（`aws configure`）
  - バケット作成（例）
    - バケット名: `avanti-front-prod`（リージョン任意）
    - CloudFront 経由配信を想定する場合は「Block Public Access 有効 + OAC」構成推奨
  - アップロード
    - HTML 等（簡易キャッシュ）:
      
      ```bash
      aws s3 sync out/ s3://avanti-front-prod/ \
        --delete \
        --cache-control "public, max-age=60"
      ```
    - 不変アセット（`_next/static` 等）は長期キャッシュ（任意）：
      
      ```bash
      aws s3 sync out/_next/ s3://avanti-front-prod/_next/ \
        --delete \
        --cache-control "public, max-age=31536000, immutable"
      ```

- 4) CloudFront 設定
  - オリジン: 上記 S3 バケット
    - OAC（Origin Access Control）を作成し、バケットポリシーへ付与（推奨）
  - ビヘイビア:
    - デフォルトドキュメント: `index.html`
    - キャッシュポリシー: HTML は短期、`_next/static` は長期
  - デプロイ後の無効化（キャッシュクリア）
    
    ```bash
    aws cloudfront create-invalidation \
      --distribution-id <YOUR_DISTRIBUTION_ID> \
      --paths "/*"
    ```

- 5) 動作確認
  - CloudFront ドメイン（例: `https://dxxxx.cloudfront.net/`）にアクセス
  - トップページ（`/`）で診断の進行と結果表示を確認

- 注意点（S3/CF）
  - ルーティング: 本アプリはトップページのみで完結する SPA 形式のため、静的エクスポートで問題ありません。複数ページ化した際はリライト/エラーハンドリング設定が必要な場合があります。
  - セキュリティ: S3 を直接公開するより CloudFront + OAC 推奨。HTTPS, WAF, ログなどの運用を検討ください。

## スクリプト一覧

- `dev`: 開発サーバ（`http://localhost:5173`）
- `build`: 本番ビルド
- `start`: 本番サーバ起動（SSR。S3 配信時は未使用）
- `validate`: 分岐/結果の整合性検証
- `generate:error-codes`: `error_codes.yaml` から `lib/error-codes.ts` を再生成
- `export`（任意で追加）: 静的エクスポート（S3/CloudFront 配信用）

## ディレクトリ

- `app/`: Next.js App Router（`page.tsx`, `layout.tsx`）
- `components/domain/diagnostics/Diagnostic.tsx`: 診断ロジックとUI
- `app/globals.css`: 全体スタイル（ダークテーマ）
- `scripts/validate-flow.js`: 分岐/結果の検証スクリプト

## ライセンス

社内/個別契約の方針に従ってください（未指定）。
