# 24. セッション紐付け (POST /auth/link-session)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/24_user_link_session.md`
  - [ ] `_documents/diagnostics/ai_career/front/03_共通診断画面.md'`
- [ ] テストコードを作る(TDD)
- [ ] テストコードを修正しつつ実装する(TDD)
- [ ] 最後にテストがオールグリーンになることを確認する(TDD)
  - [ ] docker-compose build && docker-compose run --rm -e TEST_DATABASE_URL="$TEST_DATABASE_URL" backend pytest -q
  - [ ] docker compose run --rm admin_front sh -lc "npm ci || npm install; npm run test" 
- [ ] 共通機能を実装した場合は加筆する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 次に実装するタスクに対して引継ぎ事項を記載する（_documents/notion/diagnostics 配下）
- [ ] 運用上の懸念や検討事項を記載する（_documents/notion/diagnostics 配下）

## 実装フローの前提
- バックエンドで `POST /auth/link-session` の仕様を確定させた上で、登録・ログイン後のフローから同エンドポイントを呼び出す形へ統合する。
- 既存認証フローへの影響点（リクエスト順序やトークン取得タイミングなど）があれば引継ぎに記録する。

## バックエンド
### 実装
- `POST /auth/link-session` の実装を追加し、JWT 認証済みユーザーと複数の `session_code` を一括で紐付ける。
- リクエストは `session_codes` 配列（1〜20件、英数字/ハイフン/アンダースコアのみ）を必須とし、重複はユニーク化して処理する。
- 対象セッションを FOR UPDATE で取得し、不足分があれば 404 (`E040_SESSION_NOT_FOUND`)、他ユーザー所有が混在していれば 409 (`E063_SESSION_OWNED_BY_OTHER`) でロールバックする。
- 更新対象に対して `user_id` を現在のユーザーIDに UPSERT し、`updated_at` / `ended_at` を更新する。同一ユーザーに既に紐付いている場合は冪等扱い。
- レスポンスは `linked`（今回更新できたコード）と `already_linked`（既に同一ユーザー所有だったコード）を返す 200 OK とする。
### テスト
- 正常系（単一・複数コード、既に紐付いているケース）、バリデーションエラー、存在しないコード、他ユーザー所有コードでのロールバックを TDD で網羅する。
- `linked` / `already_linked` の内容やタイムスタンプ更新を確認する。

## フロントエンド
### 実装
- ローカルストレージの診断セッション管理を見直し、登録・ログイン完了時に JWT を取得した後で `POST /auth/link-session` を呼ぶフローへ統一する。
- 呼び出し対象の `session_codes` を抽出し、成功時には同期済み状態としてステートを更新／ローカル保存データを整理する。
- 共通診断画面で回答送信後の結果画面遷移中の導線も同じエンドポイントを利用し、進捗表示やエラーハンドリング（409 など）を提供する。
  - jwtを保持している場合はAPI呼び出し、未保持の場合はスキップ

### テスト
- 会員登録 → リンク、ログイン後のリンク、既にリンク済みのケースで UI の挙動が変わらないことを確認する。
- バリデーションエラー／409／404 応答時のエラーメッセージやリトライ導線を検証するテストを追加する。
- 共通診断画面で回答送信後の結果画面遷移中の導線でjwtを保持している場合はAPI呼び出し、未保持の場合はスキップの挙動になっていることを確認する。

## 引き継ぎ事項
- 紐付け済みセッションの一覧表示や通知処理が必要になった場合は `_documents/notion/diagnostics` にまとめる。

## 運用・検討事項
- セッションの所有権移譲ポリシーや期限設定の検討事項を `_documents/notion/diagnostics` に記載する。
