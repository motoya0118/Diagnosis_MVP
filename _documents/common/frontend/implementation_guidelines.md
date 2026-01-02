# フロントエンド実装規約（Next.js / frontend 配下）

本規約は `./frontend` プロジェクトの開発者が迷わず実装・保守できるようにまとめた共通ルールです。既存の `frontend/AGENT.md` や実装構成と整合する内容のみ記載しています。

---

## 1. プロジェクト構成と責務

```
frontend/
├── app/                 # Next.js App Router。ルート単位で (group) ディレクトリを活用
│   ├── (public)/        # 匿名向け画面のルートグループ
│   │   ├── page.tsx
│   │   ├── ai-career/
│   │   │   └── diagnose/
│   │   ├── ai-jobs/
│   │   ├── login/
│   │   └── register/
│   ├── (auth)/          # 認証必須画面のルートグループ
│   │   ├── mypage/
│   │   └── sessions/
│   ├── layout.tsx       # ルートレイアウト
│   └── page.tsx         # トップレベルページ
├── components/          # 再利用コンポーネント (UI/複合ロジック別で階層化)
│   ├── ui/              # プレゼンテーショナルな小さなパーツ
│   └── domain/          # ドメイン特化の複合コンポーネント
├── features/            # 状態やロジックを含む機能単位のモジュール (新規追加時の配置先)
├── hooks/               # 再利用可能なカスタムフック
├── lib/                 # API クライアント, 設定, ヘルパー
├── styles/              # globals.css（共通トークン含む） / Tailwind 設定
├── public/              # 画像・静的ファイル
├── tests/               # Jest/RTL/Playwright テスト
│   ├── unit/
│   ├── component/
│   └── e2e/
├── scripts/             # ビルド/生成スクリプト (例: エラーコード生成)
├── error_codes.yaml     # エラーコード定義（唯一の情報源）
├── package.json / tsconfig.json / tailwind.config.ts / etc.
└── AGENT.md             # 既存運用規約
```

### 1.1 命名・配置ガイド
- **ページ/レイアウト**: `app/` 直下で Next.js App Router の規約に従う。ディレクトリ名・ファイル名は `kebab-case`。クライアントコンポーネントは `"use client"` を先頭に明記し、匿名向けは `(public)`、認証必須は `(auth)` のルートグループ配下へ配置する。
- **コンポーネント**: `components/ui` はスタイル付与のみ行い、外部状態を持たない。`components/domain` や `features/<module>/components` ではビジネスロジックも許容するが、肥大化時は `features` 直下で slice 化する。
- **API クライアント**: `lib/api/<domain>.ts` に配置し、`fetcher` や `SWR` ラッパーは共通関数として `lib/http.ts` 等に集約。
- **状態管理**: 軽量なものは React hook と Context、画面横断の重い状態は `features/<module>/store.ts` に切り出す。Redux 等を導入する場合はこの規約を拡張して明記する。
- **CSS/デザイントークン**: 色やタイポグラフィは `styles/globals.css` に CSS 変数として定義し、Tailwind の `theme.extend.colors` 等にマッピングする。

---

## 2. エラーコードの一元管理
- `_documents/common/error_code_manage.md` の方針どおり、フロントは `frontend/error_codes.yaml` を唯一の情報源とする。バックエンドと番号体系を共有しつつ、フロント固有の UI 表示内容 (`ui_message`, `action`) を定義。
- YAML 更新後は `scripts/generateErrorCodes.ts`（新設可）で `lib/error-codes.ts` などの定数を再生成し、変更をコミットする。生成物の未更新は CI で検知する想定。
- UI でエラーを扱う際は生成済みの定数を参照し、コード値のハードコーディングを避ける。

---

## 3. デザイン・UI 指針
- **フレキシブルデザイン**: レイアウトはレスポンシブ前提。`flex`, `grid`, `clamp`, `minmax`, `fluid` なサイズ指定を活用し、固定幅レイアウトは禁止。`rem`/`em`/`%` を優先し、`px` 常用は禁止（境界線など最小限のみ許容）。
  - UIはモバイル端末(iPhone12 mini)でUXよく操作できることを考慮すること。
  - ヘッダーメニューは上部固定にすること。PCでは、メニューは表示するが、モバイルサイズではアコーディオン形式に折りたたむこと。 
- **テーマ切替**: 6つのカラー変数（`--color-primary` など）を `styles/globals.css` に定義し、HTML の `data-theme` 属性や `ThemeProvider` で切り替え可能にする。新規コンポーネントは必ず `bg-primary`, `text-neutral` などトークン由来のユーティリティを使う。
- **アクセシビリティ**: カラーコントラストは WCAG AA 以上を満たす配色で設計。動的テーマでコントラストが損なわれないか Storybook/Chromatic 等で確認する。
- **コンポーネント設計**: 再利用を念頭に、Props は意味のある名前・型で定義。ロジック重複はフックへ分離し、`useXxx` 命名とする。

---

## 4. パフォーマンスとキャッシュ戦略
- **UX 優先**: UX で不整合・タイムラグが生じる場合はキャッシュを無効化する。常に「一貫した UI」と「最新データ」をトレードオフ比較し、UX 劣化が明白なときのみキャッシュを採用。
- **キャッシュ活用例**
  - Next.js App Router の `fetch` で `next: { revalidate: <seconds> }` を指定し SSR キャッシュを制御。
  - `SWR`/`React Query` 等のクライアントキャッシュを利用する際は `stale-while-revalidate` を意識し、古いデータを即座に表示できる場合のみ採用。
  - CDN は静的アセット・フォーム定義など変更頻度の低いものに限定し、LLM 結果など揮発性の高いものはキャッシュしない。
- **パフォーマンス計測**: Lighthouse/Next.js Insights でボトルネックを定期チェック。大きな変更時は PR で計測結果を共有。

---

## 5. 環境変数と環境別ホスト管理
- **定義の所在**: `frontend/.env.{environment}`（`development`/`staging`/`production`）を管理し、`docker-compose.yml` の `env_file` で読み込む。`env-sample/` にテンプレートを配置し、環境追加時はここから複製する。Vercel や Node ビルド環境では `.env.development` 等を同等の内容で管理する。
- **クライアント公開値**: フロントエンドから参照する値は `NEXT_PUBLIC_` プレフィックスを付与する（例: `NEXT_PUBLIC_API_BASE_URL`）。ブラウザに公開されるため、機密値は含めない。Axios などの `baseURL` には常に `process.env.NEXT_PUBLIC_*` を利用する。
- **ビルド時に埋め込む定数**: 共通で利用するミリ秒/秒などの定数は `next.config.js` の `env` に定義し、コメントで用途を明記する。コード側では `process.env.NEXT_PUBLIC_*` として参照し、ハードコーディングを避ける。
- **サーバー専用値**: Route Handler・Server Component 専用の値は `BACKEND_INTERNAL_URL` など `NEXT_PUBLIC_` なしで `.env.*` に記述し、Docker Compose の `env_file` や `environment` で注入する。
- **バックエンド API アクセス方針**:
  - SSR/Route Handler/Server Action からバックエンドへアクセスする際は `BACKEND_INTERNAL_URL`（未指定時のみ `NEXT_PUBLIC_BACKEND_URL`）を利用し、ブラウザに内部ホストを露出させない。
  - クライアントコンポーネントやブラウザイベントからバックエンドを直接呼ばない。必ず Next.js 側で用意した同一オリジンの Route Handler（例: `/api/diagnostics/...`）を経由させ、Node runtime でバックエンド呼び出しを発火させる。
  - `NEXT_PUBLIC_BACKEND_URL` は全てのデプロイ環境で必須とし、未設定でビルドしない。ローカル用（`http://localhost:8000` 等）のフォールバックは開発時のみ利用し、本番/ステージングでは必ず明示的に設定する。
  - バンドルキャッシュの不整合を避けるため、環境変数の変更を伴うデプロイではアセットのバージョンを更新するか、キャッシュパージ手順を合わせて実施する。
- **環境切替手順**: `project/frontend/.env.${ENV}` を Docker Compose の `env_file` で指定し、`ENV=staging docker compose up` のように切り替える。Vercel 等ではビルド環境ごとに同名の環境変数を設定する。
- **運用ルール**: 変数を追加したら `frontend/AGENT.md` と本ドキュメントの該当箇所を更新し、使用箇所のリファレンスを README に追記する。

---

## 6. テスト方針
- テスト対象は可能な限り追加し、**仕様変更に強い構造**を保つ。
  - `tests/unit/`: 純粋関数やロジックの単体テスト。
  - `tests/component/`: React Testing Library で UI 状態/イベントを検証。
  - `tests/e2e/`: Playwright で主要フローをカバー（会員登録→診断→結果など）。
- テスト命名: `<対象>.<振る舞い>` (`diagnosticsForm.submitsAnswers`) のように読みやすく。テストファイルは `*.test.ts(x)`。
- `jest --watch` / `pnpm test` などコマンドは package.json にスクリプトとして登録。
- モック利用: API は `msw` のハンドラでモックし、外部サービス依存を排除。
- CI: 全テストがパスしない限り PR はマージ不可。Conventional Commits に従い、テスト追加を含む場合は `test:` を利用可能。

---

## 7. 開発フロー・レビュー
- 機能追加時は関連ドキュメント（API 設計、画面設計、タスク分解）を更新。`frontend/AGENT.md` のフロント運用規約と矛盾しないことを確認。
- PR チェックリスト
  1. ディレクトリと命名が規約通りか。
  2. エラーコードが YAML → 生成物 → 実装で連動しているか。
  3. テストがすべて通っているか、必要なケースを網羅しているか。
  4. デザイン・テーマ運用に沿っているか（カラー変数の利用など）。
  5. パフォーマンス最適化が UX を損なっていないか。
- レビューコメントは建設的に。設計判断が必要な場合は Issue/Ticket に切り出して合意形成する。

---

## 8. 今後の拡張
- グローバルステート管理や i18n を追加する際は、本規約をベースに拡張ガイドラインを作成し `_documents/common/frontend/` に追記する。
- Storybook や Chromatic を導入する場合は、コンポーネント命名規則とテーマ切替の仕組みを合わせて記述する。
- エラーコード生成スクリプト、キャッシュ制御の標準フック (`useCacheableFetch` など) は共通化して `lib/` に配置し、再利用できる形に整備する。

この規約に従い、柔軟性と UX を両立させたフロントエンド実装を進めてください。
