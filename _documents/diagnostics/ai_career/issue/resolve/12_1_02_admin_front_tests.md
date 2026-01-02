# 12-1 admin_front テストディレクトリ再編

## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 修正方針を理解する
- [ ] `admin_front/tests` ディレクトリを新設し、`admin_front/hooks` 配下と `admin_front/lib` 配下に存在する `*.test.ts(x)` を `tests/hooks`・`tests/lib` へ移動する。移動対象は `useActiveVersions.test.tsx`, `useDiagnostics.test.tsx`, `useDiagnosticVersions.test.tsx`, `templateDownloader.test.ts` を含む。
- [ ] テスト内の相対インポート（例: `../lib/apiClient`, `./useActiveVersions`）を移動後の階層構造に合わせて更新する。
- [ ] `admin_front/vitest.config.ts` に `test.include: ["tests/**/*.test.ts?(x)"]` を設定し、`admin_front/hooks` や `admin_front/lib` をフルスキャンしないようにする。必要に応じて `test.environment` など既存設定を維持する。
- [ ] `admin_front/tsconfig.json` および `tsconfig.scripts.json` の `include`/`exclude` を更新し、新しい `tests` ディレクトリが型チェック対象になるようにする。Vitest 用型定義 (`vitest/globals`, `vitest/importMeta`) が足りなければ `admin_front/tsconfig.json` の `compilerOptions.types` に追加する。
- [ ] `npm run test`（`vitest run`）がディレクトリ移動後も成功することを確認し、必要に応じて README や `_documents/common/frontend/implementation_guidelines.md` にテスト配置変更を追記する。

## 修正方針
- 物理的なファイル移動は `mv admin_front/hooks/*.test.tsx admin_front/tests/hooks/` のように行う。移動前に `admin_front/tests/.gitkeep` を設置しておくと環境差異を防げる。
- 各テストのインポートは移動後 `../../lib/apiClient`, `../../hooks/useActiveVersions` といったパスに修正する。keep-relative のままにして、ビルドパスが `tsconfig.baseUrl` を利用しない点に注意。
- `admin_front/vitest.config.ts`: `defineConfig({ test: { include: ["tests/**/*.{test,spec}.{ts,tsx}"], environment: "jsdom", ... } })` の形式へ。既存テストが `vitest` の `mock` を使っているため `globals:true` は不要。
- `admin_front/tsconfig.json`: 現状の `include` が `["app/**/*.ts", "lib/**/*.ts", "hooks/**/*.ts", ...]` でないか確認し、`"tests/**/*.ts"` を追加する。Vitest 型定義は `devDependencies` に既にあるので `types` を列挙するだけでよい。
- 移動完了後に `npm run test` を実行し、CI が `tests` ディレクトリに依存することを確認。テスト基盤が Docker 越しに実行される場合は `_documents/notion/diagnostics/02_common_handover.md` のテスト実行手順に従う。
