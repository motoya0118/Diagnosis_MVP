import os
import sys
import time
import socket
import random
import string
from functools import lru_cache
from pathlib import Path

import pytest
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

os.environ.setdefault("TEST_ISOLATED_DB", "1")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))


def wait_for(host: str, port: int, timeout: float = 30.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=1):
                return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(f"Service {host}:{port} not reachable")


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


@lru_cache(maxsize=None)
def _load_env_file(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return {}

    values: dict[str, str] = {}
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        value = raw_value.strip()
        if not value:
            continue
        # Remove inline comments (KEY=value # comment)
        if " #" in value:
            value = value.split(" #", 1)[0].strip()
        elif value.startswith("#"):
            continue
        cleaned = _strip_quotes(value.strip())
        if cleaned:
            values[key] = cleaned
    return values


def _resolve_env_value(name: str) -> str | None:
    direct = os.environ.get(name)
    if direct is not None:
        direct_stripped = direct.strip()
        if direct_stripped:
            return direct_stripped

    env_name = os.environ.get("ENV")
    candidates: list[Path] = []
    considered: set[Path] = set()

    if env_name:
        candidate = ROOT / f".env.{env_name}"
        if candidate.exists():
            candidates.append(candidate)
            considered.add(candidate)

    # Fallback to common environment files
    for suffix in ("development", "test", "staging", "production"):
        candidate = ROOT / f".env.{suffix}"
        if candidate.exists() and candidate not in considered:
            candidates.append(candidate)
            considered.add(candidate)

    legacy = ROOT / ".env"
    if legacy.exists() and legacy not in considered:
        candidates.append(legacy)

    for path in candidates:
        value = _load_env_file(path).get(name)
        if value:
            return value.strip()

    return None


@pytest.fixture(scope="session", autouse=True)
def prepare_db():
    # Prefer TEST_DATABASE_URL; fall back to DATABASE_URL
    base_url = _resolve_env_value("TEST_DATABASE_URL") or _resolve_env_value("DATABASE_URL")
    assert base_url, "DATABASE_URL or TEST_DATABASE_URL must be set for tests"
    os.environ["TEST_DATABASE_URL"] = base_url

    created_temp_schema = False
    temp_db_name = None
    target_url = base_url
    isolate = os.environ.get("TEST_ISOLATED_DB", "0").lower() in {"1", "true", "yes"}

    try:
        url_obj = make_url(base_url)
    except Exception:
        url_obj = None

    # If MySQL, optionally create an isolated temporary schema so tests don't affect sequences/data
    if url_obj is not None and url_obj.get_backend_name().startswith("mysql"):
        # Wait for server reachability
        host = url_obj.host or "localhost"
        port = int(url_obj.port or 3306)
        wait_for(host, port, timeout=60.0)

        if isolate:
            # Build a random schema name and admin connection to 'mysql' database
            rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
            temp_db = f"test_{rand}"
            admin_url = url_obj.set(database="mysql")
            try:
                admin_engine = create_engine(admin_url)
                with admin_engine.connect() as conn:
                    conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{temp_db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"))
                admin_engine.dispose()

                # Point Alembic/test to the temp schema
                target_url = str(url_obj.set(database=temp_db))
                created_temp_schema = True
                temp_db_name = temp_db
            except Exception:
                # CREATE DATABASE not permitted; fall back to provided DB
                target_url = base_url
        else:
            target_url = base_url

    # Run migrations against the target_url
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", target_url)
    command.upgrade(cfg, "head")

    # Expose to app if it reads DATABASE_URL at runtime
    os.environ["DATABASE_URL"] = target_url
    os.environ["TEST_DATABASE_URL"] = target_url

    try:
        from app.core import config as app_config

        if hasattr(app_config, "settings"):
            app_config.settings.database_url = target_url
    except Exception:  # pragma: no cover - defensive guard for import timing
        pass

    try:
        from app.db import session as db_session

        try:
            db_session.engine.dispose()
        except Exception:
            pass
        db_session.engine = create_engine(target_url, pool_pre_ping=True, future=True)
        db_session.SessionLocal.configure(bind=db_session.engine)
    except Exception:  # pragma: no cover - defensive guard for import timing
        pass

    yield

    # Teardown: drop the temporary schema to remove data and reset sequences
    if created_temp_schema and url_obj is not None and temp_db_name:
        admin_url = url_obj.set(database="mysql")
        admin_engine = create_engine(admin_url)
        with admin_engine.connect() as conn:
            conn.execute(text(f"DROP DATABASE IF EXISTS `{temp_db_name}`"))
        admin_engine.dispose()
