## 対象
backend/app/services/diagnostics/structure_importer.py

## 発生事象
前提: 同じdiagnostic_id

1. _documents/diagnostics/ai_career/issue/ref/diagnostic_template.xlsxをアップロードし取り込み
2. 正常完了
3. _documents/diagnostics/ai_career/issue/ref/diagnostic_template2.xlsxをアップロードし取り込み
4. 500エラーが発生

## 基本方針
仕様としては、
DBテーブルのquestionsに存在しない(diagnostics_id, q_code)の場合はquestionsテーブルにINSERT, 存在する場合はUPDATE
DBテーブルのoptionsに存在しない(diagnostics_id, q_code, opt_code)の場合はoptionsテーブルにINSERT, 存在する場合はUPDATE

## タスク
- [ ] 発生事象を理解し再現方法を整理してください
- [ ] backend/tests/test_admin_import_structure.pyで、この事象が担保できているか確認してください。担保できていない場合はテストコードを修正してください
- [ ] `docker-compose build && docker-compose run --rm -e TEST_DATABASE_URL="$TEST_DATABASE_URL" backend pytest -q`でテストの失敗を確認してください
- [ ] 対象の業務ロジックを修正してください
- [ ] `docker-compose build && docker-compose run --rm -e TEST_DATABASE_URL="$TEST_DATABASE_URL" backend pytest -q`でテストの成功を確認してください