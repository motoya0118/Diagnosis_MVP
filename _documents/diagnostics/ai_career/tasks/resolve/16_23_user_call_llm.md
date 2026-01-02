# 23. LLM 実行 (POST /sessions/{session_code}/llm)

## タスクチェックリスト
- [ ] 規約を読む
  - [ ] `_documents/common/backend/implementation_guidelines.md`
  - [ ] `_documents/common/frontend/implementation_guidelines.md`
- [ ] 共通機能を理解する
  - [ ] `_documents/common/backend/CommonFunctionality.md`
  - [ ] `_documents/common/frontend/CommonFunctionality.md`
- [ ] 対象の設計書を読む
  - [ ] `_documents/diagnostics/ai_career/APIs/23_user_call_llm.md`
  - [ ] `backend/sample/bedrock_claude_sample.py`
  - [ ] `_documents/diagnostics/ai_career/front/03_共通診断画面.md` — 回答送信直後の LLM 実行
  - [ ] `_documents/diagnostics/ai_career/front/04_診断結果画面.md` — 結果表示と再実行
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
- `_documents/diagnostics/ai_career/DB設計.md` : `sessions`, `answer_choices`, `diagnostic_versions`, `version_options`

## 実装フローの前提
- バックエンドで LLM 実行の判定と Bedrock 連携を実装し、キャッシュ再利用仕様を固めてからフロントへ接続する。
- モデル選定やプロンプト構築の変更があれば引継ぎに記録する。

## バックエンド
### 実装
- ベース方針は`_documents/diagnostics/ai_career/APIs/23_user_call_llm.md`を参照
- 疎通方法は`backend/sample/bedrock_claude_sample.py`を参照
  - APIキー以外の環境変数も各.envに定義する前提で参照すること(ハードコーディングは避ける)
  - 予期しないエラー(稀にある空のレスポンス等)は1度リトライすること
  - エラーハンドリングとエラーログは想定し得る限りハンドリングすること

### テスト
- 正常実行、回答無し、Draft 版、`system_prompt`/`llm_op` 欠落、Bedrock エラー、キャッシュ再利用、`force_regenerate` の切り替えテストを TDD で作成する。
- Bedrock クライアントをスタブ化し、送信 payload とレスポンス保存を検証する。

## フロントエンド
### 実装
- 共通診断画面で回答送信後に本 API を呼び、レスポンスの `llm_result/messages` をローカル保存し結果画面へ遷移する。
- 診断結果画面で `force_regenerate` オプション付きの再実行ボタンを実装する。
- LLM 実行中のローディングと、ベッドロックエラー時の再試行 UI を追加する。
- バックエンド処理中にユーザーのブラウザ世界でタイムアウトが発生しないように考慮すること

### テスト
- LLM 実行フローの統合テスト（成功→結果画面遷移、エラー→リトライ誘導）を追加する。

## 引き継ぎ事項
- 使用する Bedrock モデルやプロンプトテンプレートの変更点を `_documents/notion/diagnostics` に残す。

## 運用・検討事項
- 実行時間やコスト、再実行ポリシーなどの懸念を `_documents/notion/diagnostics` に記録する。
