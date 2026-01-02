# 12-1 管理画面ヘッダー共通化

## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 修正方針を理解する
- [ ] `_documents/diagnostics/ai_career/front/01_管理ダッシュボード.md` と `_documents/common/frontend/CommonFunctionality.md` を確認し、管理画面ヘッダーに必要な要件（ロゴ、遷移先、ログアウト動線、レスポンシブ挙動）を整理する。
- [ ] `admin_front/components/AdminHeader.tsx`（新規）を実装し、ブランドロゴ、`/dashboard` への遷移メニュー、NextAuth を利用したログアウトアクションを盛り込む。UI は `frontend/components/layout/Header.tsx` を参考に管理画面向けに調整する。
- [ ] `admin_front/app/layout.tsx` を更新し、共通ヘッダー＋`<main>` 構造に対応させる。`admin_front/app/dashboard/page.tsx` や将来追加される管理画面ページでヘッダーが自動で表示されることを確認する。
- [ ] `admin_front/app/globals.css` を中心に、既存の `main { display:flex; ... }` 等のスタイルを見直し、ヘッダー常設レイアウトでも余白や高さが崩れないように再設計する。必要であればヘッダー専用の CSS Module（例: `admin_front/components/AdminHeader.module.css`）を追加する。
- [ ] ログアウト／ダッシュボード遷移に関連する既存 UI（`admin_front/app/dashboard/page.tsx` 内のボタン類等）がヘッダーと重複しないよう整理し、不要なスタイルの撤去を行う。

## 修正方針
- `admin_front/components/AdminHeader.tsx`: `next/link` と `next/navigation`（必要に応じて）を用いたシンプルなメニュー構造を定義し、NextAuth 連携完了後（Issue 12_1_03 参照）に `next-auth/react` の `signOut` を呼び出す。ブランド名やメニュー定義は props で拡張可能な形にしておく。
- `admin_front/app/layout.tsx`: ルートレイアウトで `<SessionProvider>`（後述 Issue と連携）を配置しつつ、`<header>` と `<main>` を明示的にレンダリングする。ログインページ (`admin_front/app/page.tsx`) などヘッダー不要なページはオプションでヘッダーを抑制できるよう Slot/Prop で制御する。
- `admin_front/app/dashboard/page.tsx`: 旧来の `AdminSession` 依存 UI を除去し、ヘッダー側で提供するログアウト・遷移 UI に一本化する。主要コンテンツのラッパーにクラスを付与し、CSS で高さ・余白を制御しやすくする。
- `admin_front/app/globals.css` および必要なモジュール CSS: `body`/`main` のフレックスレイアウトを撤去し、グリッドや余白をヘッダー付き前提に再設計する。アクセシビリティ（フォーカス可視化など）は既存実装を踏襲する。
- `frontend/components/layout/Header.tsx`: デザイン・実装の参考として比較し、共通化できる部分があれば `CommonFunctionality` のガイドラインに沿って抽象化を検討する。
