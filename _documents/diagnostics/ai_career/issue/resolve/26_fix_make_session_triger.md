## 現状の問題点
新規ユーザーがセッションがまっさらな状態で03_共通診断画面 -> 04_診断結果画面に遷移する際、
localstrage内で質問に回答したセッションに対し新規のセッションが作成され上書きされてしまう。

ローダーの裏での画面挙動を見ると、以下の挙動になっている。
03_共通診断画面(回答送信)->03_共通診断画面(再診断 or 結果表示)->03_共通診断画面(1問目の質問)->04_診断結果画面

## 原因
下記の 2 点が組み合わさり、LLM 実行待ちの間に新しいセッションが発行されて既存の `session_code` が上書きされていた。

- 回答送信完了時点で `actions.markCompleted` を呼び出し、ローカル状態を `status="completed"` に更新してしまう実装になっている（`frontend/features/diagnostics/session/answerSubmission.ts:115`）。この状態が `localStorage` に保存されるため、まだ LLM が未完了でも「完了済みセッション」と判定される。
- 成功トースト表示による再レンダーで `useSessionInitialiser` の `useEffect` がふたたび走り、`startDiagnosticSession` を再実行する（`frontend/app/(public)/diagnostics/common_qa/CommonQaScreen.tsx:192-195`）。`status !== "in_progress"` の状態は `shouldResetState` が常に新規セッション発行とみなすため、既存回答が破棄される（`frontend/features/diagnostics/commonQa/sessionLifecycle.ts:34-55`）。

結果として、LLM 実行完了までに再診断フローへ戻されたように見え、`session_code` が新しいものに差し替わる。

## 調査ログ
- 画面遷移ログ: 03_共通診断 -> 03_共通診断（完了ダイアログ） -> 03_共通診断（設問 1） -> 04_診断結果。
- ストレージ内容: 回答送信直後に `status: "completed"`・`llm_result: null` を保存 → 次の `POST /diagnostics/{code}/sessions` 応答で `session_code` が更新される。
- LLM 実行後のみ `createLlmExecutor` で `status="completed"` にする想定だったが、回答送信処理が先に完了扱いへ変更していた。

## タスク
- [ ] ローカル状態の完了フラグ更新を「LLM 完了時」に限定する (`frontend/features/diagnostics/session/answerSubmission.ts`, `frontend/features/diagnostics/session/context.tsx`, `frontend/features/diagnostics/session/types.ts`)
- [ ] 回答送信時は「LLM 待ち」用のステータス／メタ情報だけを保持するメソッドへ置き換える（要テスト更新: `frontend/tests/unit/diagnostics/answerSubmission.test.ts`）
- [ ] 自動初期化フックが一度だけ走るようにガードを追加し、トースト表示で再発火しないよう調整する (`frontend/app/(public)/diagnostics/common_qa/CommonQaScreen.tsx`)
- [ ] LLM 実行成功時のみ `markCompleted` を呼ぶパスを維持し、完了後は再診断選択ダイアログが表示されることを確認する (`frontend/features/diagnostics/session/llmExecution.ts`, `frontend/tests/unit/diagnostics/llmExecution.test.ts`)
- [ ] ドキュメント・設計書の状態遷移をアップデートする (`_documents/diagnostics/ai_career/front/03_共通診断画面.md`, `_documents/diagnostics/ai_career/issue/resolve/24_loader.md`)
