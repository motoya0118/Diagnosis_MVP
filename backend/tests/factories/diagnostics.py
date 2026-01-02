from __future__ import annotations

import factory

from app.models.diagnostic import CfgActiveVersion, Diagnostic, DiagnosticVersion

from .admin import AdminUserFactory
from .base import SQLAlchemyFactory


class DiagnosticFactory(SQLAlchemyFactory):
    class Meta:
        model = Diagnostic

    code = factory.Sequence(lambda n: f"diag{n:04d}")
    outcome_table_name = "mst_ai_jobs"
    description = factory.Faker("sentence")


class DiagnosticVersionFactory(SQLAlchemyFactory):
    class Meta:
        model = DiagnosticVersion

    diagnostic = factory.SubFactory(DiagnosticFactory)
    name = factory.Sequence(lambda n: f"Version {n}")
    description = factory.Faker("sentence")
    created_by_admin = factory.SubFactory(AdminUserFactory)
    updated_by_admin = factory.SelfAttribute("created_by_admin")

    @factory.lazy_attribute
    def diagnostic_id(self):
        return self.diagnostic.id

    @factory.lazy_attribute
    def created_by_admin_id(self):
        return self.created_by_admin.id

    @factory.lazy_attribute
    def updated_by_admin_id(self):
        return self.updated_by_admin.id


class CfgActiveVersionFactory(SQLAlchemyFactory):
    class Meta:
        model = CfgActiveVersion

    diagnostic = factory.SubFactory(DiagnosticFactory)
    version = factory.SubFactory(
        DiagnosticVersionFactory,
        diagnostic=factory.SelfAttribute("diagnostic"),
        created_by_admin=factory.SubFactory(AdminUserFactory),
    )
    created_by_admin = factory.SelfAttribute("version.created_by_admin")
    updated_by_admin = factory.SelfAttribute("created_by_admin")

    @factory.lazy_attribute
    def diagnostic_id(self):
        return self.diagnostic.id

    @factory.lazy_attribute
    def version_id(self):
        return self.version.id

    @factory.lazy_attribute
    def created_by_admin_id(self):
        return self.created_by_admin.id

    @factory.lazy_attribute
    def updated_by_admin_id(self):
        return self.updated_by_admin.id

