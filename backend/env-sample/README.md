# Backend Environment Variables

Copy one of these templates to `.env.development`, `.env.staging`, or `.env.production` as needed. Values here are safe defaults for local development.

```bash
ENV=development
HOST=0.0.0.0
PORT=8000
DATABASE_URL=mysql+pymysql://app:app@db:3306/app
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
FRONTEND_ORIGIN=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=http://localhost:3000/api/auth/callback/github
BEDROCK_REGION=ap-northeast-1
BEDROCK_DEFAULT_MODEL=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_DEFAULT_INFERENCE_PROFILE=arn:aws:bedrock:ap-northeast-1:695100305620:inference-profile/apac.anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_DEFAULT_TEMPERATURE=0.2
BEDROCK_DEFAULT_TOP_P=0.95
BEDROCK_REQUEST_TIMEOUT_SECONDS=30
BEDROCK_API_KEY=
DIAGNOSTICS_ALLOW_FALLBACK_VERSION=false
```

Adjust each environment file to match its deployment target.
