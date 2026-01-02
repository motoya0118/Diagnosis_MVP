## 背景
mst_ai_jobsを再定義した結果、のカラムが増えたのでテーブル構造を修正する

## タスク
- [ ] 背景キャッチアップ
  - [ ] AS IS -> TO BEの理解
    - AS IS: backend/scripts/seed/data/mst_ai_job_old.csv (_documents/diagnostics/ai_career/DB設計.md)
    - TO BE: backend/scripts/seed/data/mst_ai_jobs_new.csv
  - [ ] 現状の問題点の理解
    - AS ISのcsvがデフォルト','1つ読み飛ばしてseedデータをDBに反映するスクリプトになってるので修正が必要
      - backend/scripts/seed/script/seed_mst_ai_jobs.py
  - [ ] _documents/diagnostics/ai_career/DB設計.mdの修正
  - [ ] backend/app/modelsの修正
  - [ ] DB更新用のマイグレーションを作成
  - [ ] `docker-compose build`でエラーが出ないことを確認(マイグレーションを反映)
  - [ ] `docker-compose run --rm -e TEST_DATABASE_URL="$TEST_DATABASE_URL" backend pytest -q` テストが通ること
  - [ ] backend/scripts/seed/script/seed_mst_ai_jobs.pyを修正
    - [ ] TO BEのcsvを登録する前提に修正