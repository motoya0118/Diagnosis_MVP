# Bedrock Sample

This directory contains a minimal script that invokes Anthropic Claude 3 Sonnet on Amazon Bedrock using boto3 (IAM SigV4 authentication).

## Prerequisites

- Standard AWS credentials with Bedrock access (e.g. `aws sts get-caller-identity` succeeds).
- Optional: set `BEDROCK_MODEL_ID` in `backend/.env.development` to override the default `anthropic.claude-3-sonnet-20240229-v1:0`.
- Optional: set `BEDROCK_INFERENCE_PROFILE_ID` (or reuse `BEDROCK_DEFAULT_INFERENCE_PROFILE`) to an inference profile such as `arn:aws:bedrock:ap-northeast-1:695100305620:inference-profile/apac.anthropic.claude-3-sonnet-20240229-v1:0` when you need models that only support the inference profile pathway.
- Optional: set `BEDROCK_REGION` or `BEDROCK_TIMEOUT_SECONDS` to tweak runtime behaviour.
- For Anthropic models, submit the Bedrock 「use case details」 form and wait for approval; otherwise Bedrock returns `Model use case details have not been submitted` errors.
- Backend Docker image rebuilt after dependency changes:

```sh
docker-compose build backend
```

## Run

1. Rebuild (only required after dependency changes):

   ```sh
   docker-compose build backend
   ```

2. Run the sample (uses `anthropic.claude-3-sonnet-20240229-v1:0` by default, or the configured inference profile when provided):

   ```sh
   docker-compose run --rm backend python -m sample.bedrock_claude_sample
   ```

Optional flags:

- `--prompt "任意の質問"` to override the default prompt.
- `--model-id anthropic.claude-3-sonnet-20240229-v1:0` to target a different on-demand Claude model.
- `--inference-profile-id arn:aws:bedrock:...:inference-profile/apac.anthropic.claude-3-sonnet-20240229-v1:0` to invoke a model that requires inference profiles. Set to an empty string to skip.
- `--list-models` to show Anthropic models that are accessible in the selected region.
- `--list-profiles` to list inference profiles available to the current account (requires a boto3 version that exposes the API; otherwise use the AWS CLI).
- `--region ap-northeast-1` to switch regions (default is `ap-northeast-1`).
- `--timeout 60` to change the timeout in seconds.

The script prints the first text response returned by Bedrock. If the response format changes, the script falls back to printing the entire JSON payload.
