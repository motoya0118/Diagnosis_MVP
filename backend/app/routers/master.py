from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy import MetaData, Table, select, text
from sqlalchemy.engine import Result
from sqlalchemy.orm import Session
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from app.core.exceptions import BaseAppException, raise_app_error
from app.core.errors import ErrorCode
from app.deps.auth import get_db


router = APIRouter(prefix="/master", tags=["master"])

KEY_RE = re.compile(r"^mst_[A-Za-z0-9_]+$")


def _reflect_table(meta: MetaData, key: str, bind) -> Table:
    try:
        meta.reflect(bind=bind, only=[key])
    except Exception:
        raise_app_error(ErrorCode.MASTER_MASTER_NOT_FOUND, detail=f"master not found: {key}")
    tbl = meta.tables.get(key)
    if tbl is None:
        raise_app_error(ErrorCode.MASTER_MASTER_NOT_FOUND, detail=f"master not found: {key}")
    return tbl


def _col_db_type(col: sa.Column[Any]) -> str:
    t = col.type
    # Render dialect-specific type name for MySQL; fallback to generic
    try:
        return t.compile(dialect=mysql.dialect())  # type: ignore[attr-defined]
    except Exception:
        return str(t)


def _to_jsonable(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float, str, bool)):
        return value
    if isinstance(value, (datetime,)):
        return value.isoformat()
    # decimal / big int safety: stringify non-primitive numerics
    return str(value)


def _make_payload(key: str, tbl: Table, rows: list[dict[str, Any]]) -> dict[str, Any]:
    schema = [
        {
            "name": c.name,
            "db_type": _col_db_type(c),
            "nullable": bool(c.nullable),
        }
        for c in tbl.columns
    ]
    # Stable JSON to compute ETag
    stable = json.dumps({"schema": schema, "rows": rows}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    etag = hashlib.sha1(stable.encode("utf-8")).hexdigest()
    return {"key": key, "etag": etag, "schema": schema, "rows": rows}


def _fetch_rows(db: Session, tbl: Table) -> list[dict[str, Any]]:
    # Prefer common master columns if present
    cols = [c for c in tbl.columns]
    stmt = select(*cols)
    # If table has is_active/sort_order, apply defaults
    if "is_active" in tbl.c:  # type: ignore[attr-defined]
        stmt = stmt.where(tbl.c.is_active == sa.true())  # type: ignore[attr-defined]
    if "sort_order" in tbl.c:  # type: ignore[attr-defined]
        stmt = stmt.order_by(tbl.c.sort_order)  # type: ignore[attr-defined]
    result: Result = db.execute(stmt)
    out: list[dict[str, Any]] = []
    for row in result.mappings():
        out.append({k: _to_jsonable(v) for k, v in dict(row).items()})
    return out


@router.get("/versions")
def get_versions(db: Session = Depends(get_db)) -> dict[str, str]:
    # Discover master tables in current schema
    rows = db.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = database() AND table_name LIKE 'mst\_%'
            """
        )
    ).all()
    keys = [r[0] for r in rows]
    versions: dict[str, str] = {}
    meta = MetaData()
    for key in keys:
        try:
            tbl = _reflect_table(meta, key, db.bind)
            data_rows = _fetch_rows(db, tbl)
            payload = _make_payload(key, tbl, data_rows)
            versions[key] = payload["etag"]
        except BaseAppException:
            continue
    return versions


@router.get("/bundle")
def get_bundle(keys: str, db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for raw in [k.strip() for k in keys.split(",") if k.strip()]:
        out.append(get_master(raw, None, db))
    return out


@router.get("/{key}")
def get_master(
    key: str,
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    db: Session = Depends(get_db),
):
    if not KEY_RE.match(key):
        raise_app_error(ErrorCode.MASTER_MASTER_KEY_INVALID, detail="invalid master key")

    meta = MetaData()
    tbl = _reflect_table(meta, key, db.bind)
    rows = _fetch_rows(db, tbl)
    payload = _make_payload(key, tbl, rows)

    etag = f'W/"{payload["etag"]}"'
    if if_none_match and if_none_match.strip() == etag:
        # 304 Not Modified
        return Response(status_code=304)

    body = json.dumps(payload, ensure_ascii=False)
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=300",
        },
    )
