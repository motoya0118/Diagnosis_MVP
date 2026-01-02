from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.routers import admin_auth as admin_auth_router
from app.routers import admin_diagnostics as admin_diagnostics_router
from app.routers import auth as auth_router
from app.routers import diagnostics as diagnostics_router
from app.routers import master as master_router
from app.routers import sessions as sessions_router
from app.routers import users as users_router

app = FastAPI(title="Auth API")

origins = [
    o.strip()
    for o in (settings.__dict__.get("cors_allowed_origins") or "").split(",")
    if o.strip()
]
if not origins:
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://admin.localhost:3100",
        "https://main.d2mfutmeare0uz.amplifyapp.com",
        "https://main.d33f87e53ilugb.amplifyapp.com"
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)


@app.get("/")
def root():
    return {"status": "ok"}


app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(diagnostics_router.router)
app.include_router(sessions_router.router)
app.include_router(master_router.router)
app.include_router(admin_auth_router.router)
app.include_router(admin_diagnostics_router.router)

register_exception_handlers(app)
