import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select, update
from sqlalchemy.orm import sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.main import app
from app.routers import auth as auth_router
from app.models.admin_user import AdminUser
from app.models.user import RefreshToken, User


def override_get_db():
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL/TEST_DATABASE_URL must be set"
    engine = create_engine(url, future=True)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[auth_router.get_db] = override_get_db


def _unique_email(prefix: str = "user") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def _assert_error_code(response, code: ErrorCode) -> None:
    payload = response.json()
    assert payload.get("error", {}).get("code") == code.value, payload


def test_register_remember_true_and_false():
    client = TestClient(app)

    # remember_me=True → refresh_token が返る
    email1 = _unique_email("remtrue")
    res1 = client.post(
        "/auth/register",
        json={"email": email1, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-A"},
    )
    assert res1.status_code == 200, res1.text
    data1 = res1.json()
    assert data1.get("refresh_token")

    # remember_me=False → refresh_token は空文字
    email2 = _unique_email("remfalse")
    res2 = client.post(
        "/auth/register",
        json={"email": email2, "password": "passpass", "remember_me": False},
        headers={"X-Device-Id": "dev-B"},
    )
    assert res2.status_code == 200, res2.text
    data2 = res2.json()
    assert data2.get("refresh_token") == ""


def test_login_success_and_wrong_password_and_remember_flag():
    client = TestClient(app)
    email = _unique_email("login")
    # create user
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": "secret", "remember_me": False},
        headers={"X-Device-Id": "dev-C"},
    )
    assert reg.status_code == 200

    # wrong password
    bad = client.post(
        "/auth/login",
        json={"email": email, "password": "oops", "remember_me": True},
        headers={"X-Device-Id": "dev-C"},
    )
    assert bad.status_code == 401
    _assert_error_code(bad, ErrorCode.AUTH_INVALID_CREDENTIALS)

    # correct password, remember_me=False → no refresh token
    ok = client.post(
        "/auth/login",
        json={"email": email, "password": "secret", "remember_me": False},
        headers={"X-Device-Id": "dev-C"},
    )
    assert ok.status_code == 200
    assert ok.json().get("refresh_token") == ""

    # correct password, remember_me=True → refresh token should be issued
    ok2 = client.post(
        "/auth/login",
        json={"email": email, "password": "secret", "remember_me": True},
        headers={"X-Device-Id": "dev-C"},
    )
    assert ok2.status_code == 200
    assert ok2.json().get("refresh_token")


def test_refresh_rotate_and_logout():
    client = TestClient(app)
    email = _unique_email("rt")
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-D"},
    )
    assert r.status_code == 200, r.text
    rt = r.json()["refresh_token"]

    # refresh success, rotated
    r2 = client.post(
        "/auth/refresh",
        json={"refresh_token": rt},
        headers={"X-Device-Id": "dev-D"},
    )
    assert r2.status_code == 200, r2.text
    rt2 = r2.json()["refresh_token"]
    assert rt2 and rt2 != rt

    # logout single device -> should revoke
    lo = client.post(
        "/auth/logout",
        json={"refresh_token": rt2},
        headers={"X-Device-Id": "dev-D"},
    )
    assert lo.status_code == 200

    # further refresh should fail
    r3 = client.post(
        "/auth/refresh",
        json={"refresh_token": rt2},
        headers={"X-Device-Id": "dev-D"},
    )
    assert r3.status_code == 401
    _assert_error_code(r3, ErrorCode.AUTH_REFRESH_TOKEN_REVOKED)


def test_refresh_expired_marks_revoked():
    # Set an RT to past and verify refresh rejects
    client = TestClient(app)
    email = _unique_email("expire")
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-E"},
    )
    assert r.status_code == 200
    # expire in DB
    # need db session
    url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    eng = create_engine(url, future=True)
    Ses = sessionmaker(bind=eng, future=True)
    with Ses() as s:
        user = s.scalar(select(User).where(User.email == email))
        assert user is not None
        s.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id)
            .values(expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        )
        s.commit()

    rt = r.json()["refresh_token"]
    r2 = client.post(
        "/auth/refresh",
        json={"refresh_token": rt},
        headers={"X-Device-Id": "dev-E"},
    )
    assert r2.status_code == 401
    _assert_error_code(r2, ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED)


def test_users_me_requires_auth():
    client = TestClient(app)
    # unauthorized
    res = client.get("/users/me")
    assert res.status_code == 401
    _assert_error_code(res, ErrorCode.COMMON_UNAUTHENTICATED)

    # authorized
    email = _unique_email("me")
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-F"},
    )
    assert reg.status_code == 200
    access = reg.json().get("access_token")
    assert access

    me = client.get("/users/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert body.get("email") == email


def test_users_me_rejects_expired_token():
    client = TestClient(app)
    email = _unique_email("expired-user-token")
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-G"},
    )
    assert reg.status_code == 200

    url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set"
    engine = create_engine(url, future=True)
    SessionLocal = sessionmaker(bind=engine, future=True)
    expired_token: str | None = None
    try:
        with SessionLocal() as session:
            user = session.scalar(select(User).where(User.email == email))
            assert user is not None
            expired_token = create_access_token(
                str(user.id),
                expires_delta_minutes=-1,
                extra={"email": user.email},
            )
    finally:
        engine.dispose()

    assert expired_token is not None
    res = client.get("/users/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    _assert_error_code(res, ErrorCode.AUTH_INVALID_TOKEN)


def test_admin_me_rejects_user_role_token():
    client = TestClient(app)
    email = _unique_email("nonadmin")
    reg = client.post(
        "/auth/register",
        json={"email": email, "password": "passpass", "remember_me": True},
        headers={"X-Device-Id": "dev-H"},
    )
    assert reg.status_code == 200
    access_token = reg.json().get("access_token")
    assert access_token

    res = client.get("/admin_auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert res.status_code == 403
    _assert_error_code(res, ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_SCOPE_INVALID)


def test_admin_me_rejects_expired_token():
    client = TestClient(app)
    admin_user_id = f"admin-{uuid.uuid4().hex}"
    url = os.environ.get("DATABASE_URL") or os.environ.get("TEST_DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set"
    engine = create_engine(url, future=True)
    SessionLocal = sessionmaker(bind=engine, future=True)
    admin_id: int | None = None

    try:
        with SessionLocal.begin() as session:
            admin = AdminUser(user_id=admin_user_id, hashed_password="hashed", is_active=True)
            session.add(admin)
            session.flush()
            admin_id = admin.id

        expired_token = create_access_token(
            str(admin_id),
            expires_delta_minutes=-1,
            extra={"role": "admin", "user_id": admin_user_id},
        )

        res = client.get("/admin_auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert res.status_code == 401
        _assert_error_code(res, ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_INVALID)
    finally:
        if admin_id is not None:
            with SessionLocal.begin() as session:
                session.execute(delete(AdminUser).where(AdminUser.id == admin_id))
        engine.dispose()
