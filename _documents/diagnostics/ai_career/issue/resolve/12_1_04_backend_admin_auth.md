# 12-1 バックエンド管理APIの認証強化

## タスク
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 修正方針を理解する
- [ ] `backend/app/core/security.py` に JWT 共通検証ヘルパーを整備し、署名チェックに加えて `exp`（有効期限）とロール判定を行うようにする。
- [ ] `backend/app/deps/admin.py` の `get_current_admin` を上記ヘルパーを用いた実装へ更新し、`backend/app/deps/auth.py` など通常ユーザー向け依存も同じ仕組みに統一する。
- [ ] 期限切れトークン・ロール不整合を想定したテストケースを `backend/tests/test_auth_flows.py` など認証系テストに追加し、退行を防ぐ。
- [ ] `_documents/common/backend/CommonFunctionality.md` に JWT 検証共通処理の配置場所と利用手順（管理者/通常ユーザー双方の例）を追記する。

## 修正方針
- `backend/app/core/security.py`: `validate_jwt_token(token: str, required_roles: set[str])`（仮）を実装し、`jwt.decode` の結果から `exp` を UTC 基準で比較、失効時は既存の認証エラーコードを用いて `HTTPException` を投げる。ロールは `required_roles` に含まれるかを確認し、共通の戻り値フォーマット（`{"sub": ..., "roles": ...}` など）に正規化する。
- `backend/app/deps/admin.py`: `get_current_admin` では新ヘルパーに `required_roles={"admin"}` を渡し、戻り値を既存スキーマへマッピングするだけに簡素化する。通常ユーザー系の `get_current_user`（`backend/app/deps/auth.py`）も同じヘルパー経由で `{"user", "admin"}` などを許容する形に合わせる。
- テスト: 失効トークンで 401 が返ること、ロール未付与では 403/401 が返ることを API テストで確認し、必要に応じて `backend/tests/utils/auth.py` のテストヘルパーを更新する。
- ドキュメント: `_documents/common/backend/CommonFunctionality.md` に共通ヘルパーの導入理由、利用例、例外パターンを記載し、今後 JWT を扱う際はこの関数を利用する方針を明確にする。
