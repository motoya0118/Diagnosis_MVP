# Frontend Environment Variables

Copy these keys into `.env.development`, `.env.staging`, or `.env.production`.

```bash
# Public API endpoint exposed to the browser
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

# Internal backend URL for server components / route handlers
BACKEND_INTERNAL_URL=http://backend:8000

# NextAuth configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me
NEXTAUTH_SESSION_MAX_AGE_MINUTES=43200

# Optional OAuth credentials
GITHUB_ID=
GITHUB_SECRET=

# Allow debug session API
ALLOW_DEBUG_SESSION=1
```

Update the values per environment before deploying.
