## 発生事象
admin_front/app/dashboard/page.tsx画面で
draftバージョンを選択した状態でテンプレートDLを押下しDLされるファイル名が
`diagnostic_template.xlsx`になってしまう。

## 原因
admin_front/lib/templateDownloader.tsでは、
`response.headers.get("content-disposition")`とヘッダーにファイル名の指定をバックエンドから付与する仕様になっているが
`backend/app/routers/admin_diagnostics.py`の def download_diagnostic_templateで付与しているヘッダーが`Content-Disposition`と噛み合っていない様子。

## 解決

middlewareに以下を付与した

```
 expose_headers=["Content-Disposition"]
 ```