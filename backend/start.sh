#!/usr/bin/env bash
set -euo pipefail

echo "[backend] Waiting for DB..."
python - <<'PY'
import os, time
import sqlalchemy as sa

url = os.environ.get('DATABASE_URL') or os.environ.get('database_url') or 'mysql+pymysql://user:password@db:3306/app'
engine = sa.create_engine(url, pool_pre_ping=True, future=True)
for i in range(60):
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
            print('[backend] DB is up')
            break
    except Exception as e:
        print(f"[backend] DB not ready yet: {e}")
        time.sleep(2)
else:
    raise SystemExit('DB did not become ready in time')
PY

echo "[backend] Running migrations..."
# Ensure the project root is importable for Alembic (app.* imports)
export PYTHONPATH="/app:${PYTHONPATH:-}"
# Use module invocation to ensure CWD is on sys.path as well
python -m alembic -c alembic.ini upgrade head || {
  echo "[backend] Alembic migration failed"; exit 1;
}

echo "[backend] Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
