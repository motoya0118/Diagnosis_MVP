from __future__ import annotations

import factory

from app.models.admin_user import AdminUser

from .base import SQLAlchemyFactory


class AdminUserFactory(SQLAlchemyFactory):
    class Meta:
        model = AdminUser

    user_id = factory.Sequence(lambda n: f"admin{n:03d}")
    display_name = factory.Faker("name")
    hashed_password = factory.LazyFunction(lambda: "hashed")

