from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from sqlalchemy import Engine, text
from sqlalchemy.exc import ProgrammingError
from alembic import command
from alembic.config import Config

DEFAULT_TABLES: tuple[str, ...] = (
    "answer_choices",
    "version_outcomes",
    "version_options",
    "version_questions",
    "sessions",
    "aud_diagnostic_version_logs",
    "cfg_active_versions",
    "diagnostic_versions",
    "options",
    "questions",
    "diagnostics",
)


def truncate_tables(engine: Engine, tables: Sequence[str] | None = None) -> None:
    """Truncate the given tables using an AUTOCOMMIT connection.

    MySQL performs implicit commits around TRUNCATE and toggling FOREIGN_KEY_CHECKS,
    so we run the cleanup on a dedicated connection instead of reusing the test
    transaction-bound session. This avoids long-lived metadata locks that can stall
    the actual test session.
    """
    table_list = tuple(tables or DEFAULT_TABLES)
    if not table_list:
        return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        for table in table_list:
            try:
                conn.execute(text(f"TRUNCATE TABLE `{table}`"))
            except ProgrammingError as exc:  # table may not exist yet
                if getattr(exc.orig, "args", [None])[0] == 1146:
                    continue
                raise
        conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


def upgrade_schema(database_url: str) -> None:
    alembic_ini = Path(__file__).resolve().parents[2] / "alembic.ini"
    cfg = Config(str(alembic_ini))
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")


__all__ = ["truncate_tables", "DEFAULT_TABLES", "upgrade_schema"]
