# 22. 回答登録 (POST /sessions/{session_code}/answers)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/22_user_submit_answer.md`
  - [ ] `_documents/diagnostics/ai_career/front/03_共通診断画面.md` — 回答送信フロー
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

## 参照
- `_documents/diagnostics/ai_career/DB設計.md` : `sessions`, `version_options`, `answer_choices`

## 実装フローの前提
- バックエンドの回答登録 API を先に完成させてから、フロントの送信ハンドラを実装する。
- ハッシュ更新や重複制御の仕様変更があれば引継ぎへ記録する。

## バックエンド
### 実装・テスト
`_documents/diagnostics/ai_career/APIs/22_user_submit_answer.md`に従う

## フロントエンド
### 実装
- 共通診断画面で「回答を送信」ボタンから API を呼び、成功時にローカルステートを `completed` へ更新する。
- エラーコードごとの再試行/フォーム表示制御 (`E022` などはフォーム再取得を促す) を実装する。
- 送信進行中の UI ロックとローディング表示を追加する。
### テスト
- API モックを用いた送信ハンドラのユニットテスト (成功→ステート更新、エラー→UI 表示) を追加する。

## 引き継ぎ事項
- 複数回答や部分送信の要望があれば `_documents/notion/diagnostics` に記載する。

## 運用・検討事項
- 回答集中時の負荷や重複送信対策に関する懸念を `_documents/notion/diagnostics` に記録する。
