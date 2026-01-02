# Admin Front Environment Variables

```
# Backend endpoint exposed to the browser
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Internal backend URL for server components / NextAuth
ADMIN_BACKEND_URL=http://backend:8000

# Local dev port override
PORT=3100

# NextAuth configuration
NEXTAUTH_URL=http://localhost:3100
NEXTAUTH_SECRET=change-me
```

Copy these keys into `.env.development`, `.env.staging`, `.env.production` and adjust per environment.
