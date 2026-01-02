## 概要
- Amplify 経由の診断セッション API で 504 (CloudFront) が発生していた問題に対応した。
- バックエンド ECS がプライベートサブネットにあるため、API キー + bearer 署名方式では Bedrock へ接続できずタイムアウトしていた。
- boto3 の SigV4 署名を用いる `bedrock-runtime` クライアントへ切り替え、AWS 認証情報で疎通できるよう修正。

## 対応内容
- `BedrockRuntimeClient` が常に bearer 署名 (`signature_version="bearer"`) を強制していたため、SigV4 向けに boto3 既定の署名を利用するよう修正。
- CloudFront でのタイムアウト対策として、`invoke_model` でモデル ID をそのまま利用し、レスポンス Body の bytes → str 変換を追加。
- 既存の `llm_executor` やテストコードはインターフェース変更なしで動作することを確認。

## 確認項目
- 既存のユニットテスト (`backend/tests/test_user_call_llm.py`) が `BedrockRuntimeClient` の差し替えで通ることを確認。
- boto3 を用いた署名方式が Amplify/ECS 環境で使用する IAM ロールに対応していることを AWS Console で確認予定。
