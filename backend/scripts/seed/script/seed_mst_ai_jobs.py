#!/usr/bin/env python3
"""
Seed script for mst_ai_jobs using CSV data.

Default CSV: backend/scripts/seed/data/mst_ai_jobs_new.csv

Usage:
  DATABASE_URL=... python backend/scripts/seed/seed_mst_ai_jobs.py [--csv PATH]
"""
from __future__ import annotations

import argparse
import csv
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from sqlalchemy import MetaData, create_engine, select, update, insert


@dataclass
class AiJobRow:
    name: str
    category: str | None
    role_summary: str
    main_role: str | None
    collaboration_style: str | None
    strength_areas: str | None
    description: str
    avg_salary_jpy: str | None
    target_phase: str | None
    core_skills: str | None
    deliverables: str | None
    pathway_detail: str | None
    ai_tools: str | None
    advice: str | None
    sort_order: int


def infer_repo_root() -> Path:
    # backend/scripts/seed/seed_mst_ai_jobs.py -> repo root = parents[2]
    return Path(__file__).resolve().parents[1]


def parse_csv(path: Path) -> list[AiJobRow]:
    rows: list[AiJobRow] = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError("CSV header is missing or empty")
        expected_headers = [
            "カテゴリ",
            "職種",
            "要約",
            "主な役割",
            "関わり方",
            "強みが必要な領域",
            "平均年収",
            "対象フェーズ",
            "必要スキル",
            "成果物",
            "なるための経路",
            "よく使うAIツール",
            "特徴",
            "目指す人へのアドバイス",
        ]
        missing_headers = [h for h in expected_headers if h not in reader.fieldnames]
        if missing_headers:
            raise RuntimeError(f"CSV headers missing required columns: {', '.join(missing_headers)}")

        def _get(rec: dict[str, str | None], key: str) -> str:
            value = rec.get(key, "")
            return value.strip() if value else ""

        order = 1
        for rec in reader:
            if rec is None:
                continue
            name = _get(rec, "職種")
            if not name:
                continue

            rows.append(
                AiJobRow(
                    name=name,
                    category=_get(rec, "カテゴリ") or None,
                    role_summary=_get(rec, "要約"),
                    main_role=_get(rec, "主な役割") or None,
                    collaboration_style=_get(rec, "関わり方") or None,
                    strength_areas=_get(rec, "強みが必要な領域") or None,
                    description=_get(rec, "特徴"),
                    avg_salary_jpy=_get(rec, "平均年収") or None,
                    target_phase=_get(rec, "対象フェーズ") or None,
                    core_skills=_get(rec, "必要スキル") or None,
                    deliverables=_get(rec, "成果物") or None,
                    pathway_detail=_get(rec, "なるための経路") or None,
                    ai_tools=_get(rec, "よく使うAIツール") or None,
                    advice=_get(rec, "目指す人へのアドバイス") or None,
                    sort_order=order,
                )
            )
            order += 1
    return rows


def seed(database_url: str, items: Iterable[AiJobRow]) -> None:
    engine = create_engine(database_url, pool_pre_ping=True, future=True)
    meta = MetaData()
    meta.reflect(bind=engine, only=["mst_ai_jobs"])  # requires migration applied
    table = meta.tables.get("mst_ai_jobs")
    if table is None:
        raise RuntimeError("Table mst_ai_jobs not found. Did you run alembic upgrade head?")

    to_insert = []
    to_update = []
    with engine.begin() as conn:
        existing = set(
            name for (name,) in conn.execute(select(table.c.name)).all()  # type: ignore[attr-defined]
        )
        for it in items:
            payload = {
                "name": it.name,
                "category": it.category,
                "role_summary": it.role_summary,
                "main_role": it.main_role,
                "collaboration_style": it.collaboration_style,
                "strength_areas": it.strength_areas,
                "description": it.description,
                "avg_salary_jpy": it.avg_salary_jpy,
                "target_phase": it.target_phase,
                "core_skills": it.core_skills,
                "deliverables": it.deliverables,
                "pathway_detail": it.pathway_detail,
                "ai_tools": it.ai_tools,
                "advice": it.advice,
                "is_active": True,
                "sort_order": it.sort_order,
            }
            if it.name in existing:
                to_update.append(payload)
            else:
                to_insert.append(payload)

        if to_insert:
            conn.execute(insert(table), to_insert)
        for payload in to_update:
            conn.execute(
                update(table)  # type: ignore[arg-type]
                .where(table.c.name == payload["name"])  # type: ignore[attr-defined]
                .values(
                    category=payload["category"],
                    role_summary=payload["role_summary"],
                    main_role=payload["main_role"],
                    collaboration_style=payload["collaboration_style"],
                    strength_areas=payload["strength_areas"],
                    description=payload["description"],
                    avg_salary_jpy=payload["avg_salary_jpy"],
                    target_phase=payload["target_phase"],
                    core_skills=payload["core_skills"],
                    deliverables=payload["deliverables"],
                    pathway_detail=payload["pathway_detail"],
                    ai_tools=payload["ai_tools"],
                    advice=payload["advice"],
                    is_active=True,
                    sort_order=payload["sort_order"],
                )
            )

    engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed mst_ai_jobs from CSV")
    default_csv = infer_repo_root() / "data/mst_ai_jobs_new.csv"
    parser.add_argument("--csv", type=Path, default=default_csv, help="Path to mst_ai_jobs CSV")
    parser.add_argument("--db", type=str, default=os.environ.get("DATABASE_URL") or os.environ.get("database_url"), help="SQLAlchemy DB URL")
    args = parser.parse_args()

    if not args.db:
        raise SystemExit("DATABASE_URL (or --db) is required")
    if not args.csv.exists():
        raise SystemExit(f"CSV not found: {args.csv}")

    items = parse_csv(args.csv)
    if not items:
        raise SystemExit("No rows parsed from CSV")
    seed(args.db, items)
    print(f"Seeded mst_ai_jobs: {len(items)} rows (inserted/updated)")


if __name__ == "__main__":
    main()
