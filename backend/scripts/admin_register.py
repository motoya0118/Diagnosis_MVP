"""Utility script to create admin users from the command line.

Usage:
    python admin_register.py <user_id> <password> [--display-name "Name"] [--inactive]
"""
from __future__ import annotations

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.admin_user import AdminUser


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a new admin user")
    parser.add_argument("user_id", help="Unique identifier used for admin login")
    parser.add_argument("password", help="Initial password for the admin user")
    parser.add_argument("--display-name", dest="display_name", help="Optional display name", default=None)
    parser.add_argument("--inactive", action="store_true", help="Create the admin user in an inactive state")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    with SessionLocal() as session:
        existing = session.scalar(select(AdminUser).where(AdminUser.user_id == args.user_id))
        if existing:
            print(f"[ERROR] admin user '{args.user_id}' already exists (id={existing.id})", file=sys.stderr)
            return 1

        admin = AdminUser(
            user_id=args.user_id,
            display_name=args.display_name,
            hashed_password=get_password_hash(args.password),
            is_active=not args.inactive,
        )
        session.add(admin)
        try:
            session.commit()
        except SQLAlchemyError as exc:
            session.rollback()
            print(f"[ERROR] Failed to create admin user: {exc}", file=sys.stderr)
            return 1

        session.refresh(admin)
        print(f"[OK] Created admin user '{admin.user_id}' (id={admin.id})")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
