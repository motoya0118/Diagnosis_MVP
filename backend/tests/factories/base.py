from __future__ import annotations

from typing import ClassVar

import factory
from sqlalchemy.orm import Session


class _SessionRegistry:
    session: ClassVar[Session | None] = None


def set_factory_session(session: Session | None) -> None:
    """Configure the SQLAlchemy session used by factories."""

    _SessionRegistry.session = session


class SQLAlchemyFactory(factory.alchemy.SQLAlchemyModelFactory):
    """Base factory that persists objects via the configured session."""

    class Meta:
        abstract = True
        sqlalchemy_session = _SessionRegistry
        sqlalchemy_session_persistence = "flush"

    @classmethod
    def _create(cls, model_class, *args, **kwargs):  # type: ignore[override]
        session = _SessionRegistry.session
        if session is None:  # pragma: no cover - defensive branch
            raise RuntimeError("Factory session has not been configured")
        obj = model_class(*args, **kwargs)
        session.add(obj)
        session.flush()
        return obj

