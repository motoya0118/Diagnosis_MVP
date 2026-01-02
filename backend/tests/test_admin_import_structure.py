from __future__ import annotations

import io
import json
from collections.abc import Iterator
import os
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from app.models.diagnostic import (
    Diagnostic,
    DiagnosticVersion,
    DiagnosticVersionAuditLog,
    Option,
    Question,
    VersionOption,
    VersionOutcome,
    VersionQuestion,
)
from app.models.mst_ai_job import MstAiJob
from app.services.diagnostics import structure_importer
from app.services.diagnostics.structure_importer import (
    OptionImportRow,
    OutcomeImportRow,
    QuestionImportRow,
    StructureImportBatch,
    StructureImportParseError,
)
from tests.factories import (
    AdminUserFactory,
    DiagnosticFactory,
    DiagnosticVersionFactory,
    set_factory_session,
)
from tests.utils.db import truncate_tables, DEFAULT_TABLES, upgrade_schema


def _get_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set for tests"
    return url


@pytest.fixture
def db_session(prepare_db) -> Iterator[Session]:
    engine = create_engine(_get_database_url(), future=True)
    truncate_tables(engine, DEFAULT_TABLES + ("mst_ai_jobs",))
    upgrade_schema(_get_database_url())
    connection = engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=connection,
        future=True,
    )
    session = TestingSessionLocal()
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):  # pragma: no cover - fixture wiring
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    session.flush()
    set_factory_session(session)

    try:
        yield session
    finally:
        session.rollback()
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()
        set_factory_session(None)


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[admin_deps.get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(admin_deps.get_db, None)


def _auth_header(admin_id: int) -> dict[str, str]:
    token = create_access_token(
        str(admin_id),
        extra={"role": "admin", "user_id": f"admin{admin_id:03d}"},
        expires_delta_minutes=15,
    )
    return {"Authorization": f"Bearer {token}"}


OUTCOME_HEADERS = [
    "name",
    "category",
    "role_summary",
    "main_role",
    "collaboration_style",
    "strength_areas",
    "description",
    "avg_salary_jpy",
    "target_phase",
    "core_skills",
    "deliverables",
    "pathway_detail",
    "ai_tools",
    "advice",
    "sort_order",
    "is_active",
]


def _outcome_values(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "AIアーキテクト",
        "category": "戦略・経営系",
        "role_summary": "全体設計を担う",
        "main_role": "AIシステム全体像を構築する",
        "collaboration_style": "事業部門と技術チームを橋渡しする",
        "strength_areas": "アーキテクチャ設計, チームリード",
        "description": "AI プロジェクトの構成を設計する",
        "avg_salary_jpy": "9000000",
        "target_phase": "実行層",
        "core_skills": "Python, ML",
        "deliverables": "AIアーキ設計書",
        "pathway_detail": "エンジニア→アーキテクト",
        "sort_order": 1,
        "ai_tools": "ChatGPT",
        "advice": "プロジェクト全体を俯瞰する力を磨く",
        "is_active": 1,
    }
    base.update(overrides)
    return base


def seed_import_rows() -> StructureImportBatch:
    return StructureImportBatch(
        questions=[
            QuestionImportRow(
                q_code="Q100",
                display_text="新しい質問テキスト",
                multi=False,
                sort_order=10,
                is_active=True,
                row_index=2,
            )
        ],
        options=[
            OptionImportRow(
                q_code="Q100",
                opt_code="OPT-A",
                display_label="新しい選択肢",
                sort_order=1,
                is_active=True,
                llm_op={"weight": 0.7},
                row_index=2,
            )
        ],
        outcomes=[
            OutcomeImportRow(
                values=_outcome_values(),
                row_index=2,
            )
        ],
        warnings=["新規アウトカムが追加されました"],
        outcome_headers=list(OUTCOME_HEADERS),
    )


def _build_template_outcome_rows() -> tuple[list[OutcomeImportRow], list[str]]:
    rows: list[OutcomeImportRow] = []
    dataset = [
        _outcome_values(
            name="AI戦略コンサルタント",
            category="戦略・経営系",
            role_summary="企業のAI戦略立案・組織変革を牽引する戦略リーダー",
            main_role="AI戦略ビジョン策定、組織変革設計、ROI評価、統率",
            collaboration_style="経営層・投資家・事業部門と対話",
            strength_areas="経営戦略・分析力・リーダーシップ",
            description=(
                "経営課題から逆算したAI導入戦略を描き、組織変革まで伴走する。\n"
                "成果指標やROIも定義し、全社横断の推進体制を整える。"
            ),
            avg_salary_jpy="1,200〜2,000万円",
            target_phase="課題認識層（TA_GA）、拡大型",
            core_skills="戦略立案力、AI応用知識、ファイナンス理解、リーダーシップ",
            deliverables="AI戦略ロードマップ、ROI分析レポート",
            pathway_detail="戦略コンサル → AI特化 → パートナー/独立",
            ai_tools="ChatGPT, Claude, Perplexity",
            advice="経営と技術の双方から語れるよう継続的にインプットする",
            sort_order=1,
            is_active=1,
        ),
        _outcome_values(
            name="AI事業開発マネージャー",
            category="戦略・経営系",
            role_summary="AI技術を活用した新規事業創出・市場開拓を担うビジネスリーダー",
            main_role="新規事業戦略、市場分析、事業モデル設計、収益化",
            collaboration_style="経営層・事業部・外部パートナーと連携",
            strength_areas="ビジネス構想力・収益設計力",
            description=(
                "市場トレンドを捉えた仮説検証を高速に回し、AIサービスの価値を顧客に届ける。"
            ),
            avg_salary_jpy="1,000〜1,800万円",
            target_phase="課題認識層（TA_GA）、実行層",
            core_skills="市場分析力、事業企画力、AI理解、P&Lマネジメント",
            deliverables="新規事業計画書、AIサービス設計図",
            pathway_detail="事業開発 → AI市場理解 → 事業責任者",
            ai_tools="ChatGPT, Pitch, Crunchbase",
            advice="テクノロジーを収益モデルに落とし込む訓練を重ねる",
            sort_order=2,
            is_active=1,
        ),
    ]

    for index, payload in enumerate(dataset, start=2):
        rows.append(OutcomeImportRow(values=payload, row_index=index))

    return rows, list(OUTCOME_HEADERS)


def _make_question(
    db: Session,
    diagnostic_id: int,
    code: str,
    text: str,
    *,
    multi: bool,
    sort_order: int,
    is_active: bool,
) -> Question:
    question = Question(
        diagnostic_id=diagnostic_id,
        q_code=code,
        display_text=text,
        multi=multi,
        sort_order=sort_order,
        is_active=is_active,
    )
    db.add(question)
    db.flush()
    return question


def _make_option(
    db: Session,
    question: Question,
    *,
    code: str,
    label: str,
    sort_order: int,
    is_active: bool = True,
    llm_op: dict | None = None,
) -> Option:
    option = Option(
        question_id=question.id,
        opt_code=code,
        display_label=label,
        sort_order=sort_order,
        is_active=is_active,
        llm_op=llm_op,
    )
    db.add(option)
    db.flush()
    return option


def _make_version_question(
    db: Session,
    *,
    version: DiagnosticVersion,
    question: Question,
    admin_id: int,
    sort_order: int | None = None,
    is_active: bool | None = None,
) -> VersionQuestion:
    version_question = VersionQuestion(
        version_id=version.id,
        diagnostic_id=version.diagnostic_id,
        question_id=question.id,
        q_code=question.q_code,
        display_text=question.display_text,
        multi=question.multi,
        sort_order=sort_order if sort_order is not None else question.sort_order,
        is_active=is_active if is_active is not None else question.is_active,
        created_by_admin_id=admin_id,
    )
    db.add(version_question)
    db.flush()
    return version_question


def _make_version_option(
    db: Session,
    *,
    version: DiagnosticVersion,
    version_question: VersionQuestion,
    option: Option,
    admin_id: int,
    sort_order: int | None = None,
    is_active: bool | None = None,
    llm_op: dict | None = None,
) -> VersionOption:
    version_option = VersionOption(
        version_id=version.id,
        version_question_id=version_question.id,
        option_id=option.id,
        q_code=version_question.q_code,
        opt_code=option.opt_code,
        display_label=option.display_label,
        sort_order=sort_order if sort_order is not None else option.sort_order,
        llm_op=llm_op if llm_op is not None else option.llm_op,
        is_active=is_active if is_active is not None else option.is_active,
        created_by_admin_id=admin_id,
    )
    db.add(version_option)
    db.flush()
    return version_option


def _create_excel_bytes() -> bytes:
    return b"dummy-xlsx-bytes"


def test_import_structure_existing_question_with_new_option_and_outcome(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    existing_question = _make_question(
        db_session,
        diagnostic.id,
        code="Q100",
        text="既存の質問",
        multi=True,
        sort_order=1,
        is_active=False,
    )

    batch = StructureImportBatch(
        questions=[
            QuestionImportRow(
                q_code="Q100",
                display_text="更新後の質問テキスト",
                multi=False,
                sort_order=10,
                is_active=True,
                row_index=2,
            )
        ],
        options=[
            OptionImportRow(
                q_code="Q100",
                opt_code="OPT-NEW",
                display_label="追加された選択肢",
                sort_order=1,
                is_active=True,
                llm_op=None,
                row_index=2,
            )
        ],
        outcomes=[
            OutcomeImportRow(
                values=_outcome_values(
                    name="AIカタリスト",
                    role_summary="変革を推進する",
                    main_role="全社のAI変革を設計する",
                    collaboration_style="経営層と現場を接続する",
                    strength_areas="Change Management",
                    description="組織横断でAI導入を加速する",
                    avg_salary_jpy="9500000",
                    target_phase="拡大型",
                    core_skills="Change Management",
                    deliverables="変革ロードマップ",
                    pathway_detail="PM→AI推進リーダー",
                    ai_tools="Notion AI",
                    advice="変革の旗振り役になる",
                    sort_order=1,
                ),
                row_index=2,
            )
        ],
        warnings=[],
        outcome_headers=list(OUTCOME_HEADERS),
    )

    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, _: batch,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["questions_imported"] == 1
    assert payload["options_imported"] == 1
    assert payload["outcomes_imported"] == 1

    updated_question = db_session.get(Question, existing_question.id)
    assert updated_question is not None
    assert updated_question.display_text == "更新後の質問テキスト"
    assert updated_question.multi is False

    new_option = db_session.execute(
        select(Option).where(Option.question_id == existing_question.id, Option.opt_code == "OPT-NEW")
    ).scalar_one()
    assert new_option.display_label == "追加された選択肢"
    assert new_option.is_active is True

    version_option_count = db_session.execute(
        select(func.count()).select_from(VersionOption).where(VersionOption.version_id == version.id)
    ).scalar_one()
    assert version_option_count == 1

    version_outcome_count = db_session.execute(
        select(func.count()).select_from(VersionOutcome).where(VersionOutcome.version_id == version.id)
    ).scalar_one()
    assert version_outcome_count == 1


def test_import_structure_outcome_meta_matches_template_dataset(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    base_batch = seed_import_rows()
    template_outcomes, template_headers = _build_template_outcome_rows()
    assert template_outcomes, "diagnostic_template.xlsx must contain at least one outcome row"

    batch = StructureImportBatch(
        questions=base_batch.questions,
        options=base_batch.options,
        outcomes=template_outcomes,
        warnings=[],
        outcome_headers=template_headers,
    )

    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, _: batch,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={
            "file": (
                "structure.xlsx",
                io.BytesIO(_create_excel_bytes()),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["questions_imported"] == len(base_batch.questions)
    assert payload["options_imported"] == len(base_batch.options)
    assert payload["outcomes_imported"] == len(template_outcomes)
    assert len(payload["warnings"]) == len(template_outcomes)

    stored_outcomes = db_session.execute(
        select(VersionOutcome).where(VersionOutcome.version_id == version.id)
    ).scalars().all()
    assert len(stored_outcomes) == len(template_outcomes)

    meta_by_name = {
        outcome.outcome_meta_json.get("name"): outcome.outcome_meta_json
        for outcome in stored_outcomes
    }
    assert None not in meta_by_name, "all outcomes should provide a name key in outcome_meta_json"

    for row in template_outcomes:
        expected = row.values
        name = expected.get("name")
        assert name, "template outcome rows must include a name"
        actual = meta_by_name.get(name)
        assert actual is not None
        for key, value in expected.items():
            assert key in actual
            assert actual[key] == value


def test_import_structure_existing_option_with_new_question_and_outcome(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    existing_question = _make_question(
        db_session,
        diagnostic.id,
        code="Q100",
        text="既存の質問",
        multi=False,
        sort_order=1,
        is_active=True,
    )
    existing_option = _make_option(
        db_session,
        existing_question,
        code="OPT-KEEP",
        label="既存の選択肢",
        sort_order=2,
        is_active=False,
        llm_op={"weight": 0.1},
    )

    batch = StructureImportBatch(
        questions=[
            QuestionImportRow(
                q_code="Q100",
                display_text="更新後の質問",
                multi=False,
                sort_order=5,
                is_active=True,
                row_index=2,
            ),
            QuestionImportRow(
                q_code="Q200",
                display_text="新規設問",
                multi=True,
                sort_order=6,
                is_active=True,
                row_index=3,
            ),
        ],
        options=[
            OptionImportRow(
                q_code="Q100",
                opt_code="OPT-KEEP",
                display_label="更新済み選択肢",
                sort_order=3,
                is_active=True,
                llm_op={"weight": 0.9},
                row_index=2,
            ),
            OptionImportRow(
                q_code="Q200",
                opt_code="OPT-NEW",
                display_label="新しい選択肢",
                sort_order=1,
                is_active=True,
                llm_op=None,
                row_index=3,
            ),
        ],
        outcomes=[
            OutcomeImportRow(
                values=_outcome_values(
                    name="AIリサーチャー",
                    role_summary="研究領域をリードする",
                    main_role="先端AI技術の研究開発を推進する",
                    collaboration_style="研究機関・開発チームと協働する",
                    strength_areas="リサーチ, 論文執筆",
                    description="AI 技術の新規性を探索する",
                    avg_salary_jpy="11000000",
                    target_phase="探索層",
                    core_skills="PyTorch, LLM",
                    deliverables="研究レポート",
                    pathway_detail="学生研究→R&D",
                    ai_tools="PyTorch",
                    advice="論文を継続的に追う",
                    sort_order=1,
                ),
                row_index=2,
            )
        ],
        warnings=[],
        outcome_headers=list(OUTCOME_HEADERS),
    )

    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, _: batch,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["questions_imported"] == 2
    assert payload["options_imported"] == 2
    assert payload["outcomes_imported"] == 1

    updated_option = db_session.get(Option, existing_option.id)
    assert updated_option is not None
    assert updated_option.display_label == "更新済み選択肢"
    assert updated_option.is_active is True
    assert updated_option.llm_op == {"weight": 0.9}

    new_question = db_session.execute(
        select(Question).where(Question.diagnostic_id == diagnostic.id, Question.q_code == "Q200")
    ).scalar_one()
    assert new_question.display_text == "新規設問"
    assert new_question.multi is True

    new_option = db_session.execute(
        select(Option).where(Option.question_id == new_question.id, Option.opt_code == "OPT-NEW")
    ).scalar_one()
    assert new_option.display_label == "新しい選択肢"

    version_question_count = db_session.execute(
        select(func.count()).select_from(VersionQuestion).where(VersionQuestion.version_id == version.id)
    ).scalar_one()
    assert version_question_count == 2

    version_option_count = db_session.execute(
        select(func.count()).select_from(VersionOption).where(VersionOption.version_id == version.id)
    ).scalar_one()
    assert version_option_count == 2


def test_import_structure_existing_outcome_with_new_question_and_option(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    existing_outcome = MstAiJob(
        name="AIコンサルタント",
        category="旧カテゴリ",
        role_summary="旧概要",
        main_role="旧メイン職務",
        collaboration_style="旧関わり方",
        strength_areas="旧強み領域",
        description="旧説明",
        avg_salary_jpy="8000000",
        target_phase="旧フェーズ",
        core_skills="Excel",
        deliverables="旧成果物",
        pathway_detail="旧キャリアパス",
        ai_tools="旧ツール",
        advice="旧アドバイス",
        is_active=False,
        sort_order=3,
    )
    db_session.add(existing_outcome)
    db_session.flush()

    batch = StructureImportBatch(
        questions=[
            QuestionImportRow(
                q_code="Q300",
                display_text="アウトカム更新用の新規設問",
                multi=False,
                sort_order=1,
                is_active=True,
                row_index=2,
            )
        ],
        options=[
            OptionImportRow(
                q_code="Q300",
                opt_code="OPT-OUTCOME",
                display_label="新しい回答",
                sort_order=1,
                is_active=True,
                llm_op=None,
                row_index=2,
            )
        ],
        outcomes=[
            OutcomeImportRow(
                values=_outcome_values(
                    name="AIコンサルタント",
                    role_summary="企業変革を伴走する",
                    main_role="顧客と共にAI戦略を実行する",
                    collaboration_style="経営層・現場とのハブになる",
                    strength_areas="Data Strategy",
                    description="顧客企業のAI戦略を立案・実行する",
                    avg_salary_jpy="12000000",
                    target_phase="拡大型",
                    core_skills="Data Strategy",
                    deliverables="提案書・改善レポート",
                    pathway_detail="戦略コンサル→AIコンサル",
                    ai_tools="Power BI",
                    advice="顧客視点で語る力を磨く",
                    sort_order=2,
                ),
                row_index=2,
            )
        ],
        warnings=[],
        outcome_headers=list(OUTCOME_HEADERS),
    )

    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, _: batch,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["questions_imported"] == 1
    assert payload["options_imported"] == 1
    assert payload["outcomes_imported"] == 1

    updated_outcome = db_session.execute(
        select(MstAiJob).where(MstAiJob.id == existing_outcome.id)
    ).scalar_one()
    assert updated_outcome.category == "戦略・経営系"
    assert updated_outcome.role_summary == "企業変革を伴走する"
    assert updated_outcome.main_role == "顧客と共にAI戦略を実行する"
    assert updated_outcome.collaboration_style == "経営層・現場とのハブになる"
    assert updated_outcome.strength_areas == "Data Strategy"
    assert updated_outcome.description == "顧客企業のAI戦略を立案・実行する"
    assert updated_outcome.avg_salary_jpy == "12000000"
    assert updated_outcome.target_phase == "拡大型"
    assert updated_outcome.is_active is True
    assert updated_outcome.sort_order == 2
    assert updated_outcome.core_skills == "Data Strategy"
    assert updated_outcome.deliverables == "提案書・改善レポート"
    assert updated_outcome.pathway_detail == "戦略コンサル→AIコンサル"
    assert updated_outcome.ai_tools == "Power BI"
    assert updated_outcome.advice == "顧客視点で語る力を磨く"

    version_outcome = db_session.execute(
        select(VersionOutcome).where(VersionOutcome.version_id == version.id)
    ).scalar_one()
    assert version_outcome.outcome_id == existing_outcome.id
    assert version_outcome.sort_order == 2

    version_option = db_session.execute(
        select(VersionOption).where(VersionOption.version_id == version.id)
    ).scalar_one()
    assert version_option.opt_code == "OPT-OUTCOME"


def test_import_structure_updates_option_when_code_changes(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    initial_batch = StructureImportBatch(
        questions=[
            QuestionImportRow(
                q_code="Q002",
                display_text="meは何が好き？",
                multi=False,
                sort_order=1,
                is_active=True,
                row_index=2,
            )
        ],
        options=[
            OptionImportRow(
                q_code="Q002",
                opt_code="op1",
                display_label="マフラー",
                sort_order=1,
                is_active=True,
                llm_op={"red": 10},
                row_index=2,
            ),
            OptionImportRow(
                q_code="Q002",
                opt_code="op2",
                display_label="orane",
                sort_order=2,
                is_active=True,
                llm_op={"orage": 10},
                row_index=3,
            ),
            OptionImportRow(
                q_code="Q002",
                opt_code="op3",
                display_label="snow",
                sort_order=3,
                is_active=True,
                llm_op={"white": 10},
                row_index=4,
            ),
            OptionImportRow(
                q_code="Q002",
                opt_code="op4",
                display_label="water melon",
                sort_order=4,
                is_active=True,
                llm_op={"green": 10},
                row_index=5,
            ),
        ],
        outcomes=[
            OutcomeImportRow(
                values=_outcome_values(
                    name="プロンプトエンジニア",
                    category="生成AIエンジニアリング",
                    role_summary="生成AIへの入力指示を設計し、出力の正確性・一貫性・安全性を最適化。",
                    main_role="プロンプト設計と品質管理を担う",
                    collaboration_style="現場メンバーと連携し最適化",
                    strength_areas="言語化力, 構造化思考",
                    description="生成AIに「どう答えさせるか」を工夫する仕事。たとえば「お客様からの問い合わせメールに丁寧に答える文章を作る」といった依頼に対し、AIに正確でわかりやすい答えを出させるための指示（プロンプト）を作る。社内マニュアルの自動化や業務効率化にも貢献。",
                    avg_salary_jpy="約500〜800万円",
                    target_phase="実行層",
                    core_skills="プログラミング基礎、NLP基礎、生成AI実務",
                    deliverables="プロンプトテンプレート",
                    pathway_detail="①基礎学習：生成AIの仕組みと制約を理解（LLMの原理、NLP基礎）。\n②演習課題：ChatGPTやClaudeを用いて同じ指示で出力差を比較。改善プロンプトを設計。\n③応用演習：FAQ自動化やメール生成など業務ケースをプロンプトで再現。\n④評価方法：出力の正確性・一貫性をルーブリックで採点。\n⑤実務移行：社内業務改善に導入し、成果を定量化（工数削減率など）。",
                    ai_tools="ChatGPT, Claude",
                    advice="現場課題とAIの出力差分を観察する",
                    sort_order=1,
                ),
                row_index=2,
            )
        ],
        warnings=[],
        outcome_headers=list(OUTCOME_HEADERS),
    )

    updated_batch = StructureImportBatch(
        questions=initial_batch.questions,
        options=[
            OptionImportRow(
                q_code="Q002",
                opt_code="change",
                display_label="マフラー",
                sort_order=1,
                is_active=True,
                llm_op={"red": 10},
                row_index=2,
            ),
            *initial_batch.options[1:],
        ],
        outcomes=initial_batch.outcomes,
        warnings=[],
        outcome_headers=list(OUTCOME_HEADERS),
    )

    batches = iter([initial_batch, updated_batch])

    def _next_batch(self, _content):
        try:
            return next(batches)
        except StopIteration:
            return updated_batch

    monkeypatch.setattr(structure_importer.StructureImporter, "_parse_workbook", _next_batch)

    response_initial = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={
            "file": (
                "structure.xlsx",
                io.BytesIO(_create_excel_bytes()),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response_initial.status_code == 200

    question = db_session.execute(
        select(Question).where(Question.diagnostic_id == diagnostic.id, Question.q_code == "Q002")
    ).scalar_one()
    original_option = db_session.execute(
        select(Option).where(Option.question_id == question.id, Option.opt_code == "op1")
    ).scalar_one()

    response_updated = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={
            "file": (
                "structure.xlsx",
                io.BytesIO(_create_excel_bytes()),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response_updated.status_code == 200

    options = db_session.execute(
        select(Option).where(Option.question_id == question.id).order_by(Option.sort_order)
    ).scalars().all()
    assert [option.opt_code for option in options] == ["change", "op2", "op3", "op4"]
    renamed_option = options[0]
    assert renamed_option.id == original_option.id
    assert renamed_option.display_label == "マフラー"
    assert renamed_option.sort_order == 1
    assert renamed_option.is_active is True
    assert renamed_option.llm_op == {"red": 10}

    version_options = db_session.execute(
        select(VersionOption)
        .where(VersionOption.version_id == version.id)
        .order_by(VersionOption.sort_order)
    ).scalars().all()
    assert [vo.opt_code for vo in version_options] == ["change", "op2", "op3", "op4"]
def test_import_structure_persists_rows(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    # Existing rows should be replaced by the import
    question = _make_question(
        db_session,
        diagnostic.id,
        code="Q100",
        text="旧設問",
        multi=True,
        sort_order=1,
        is_active=False,
    )
    option = _make_option(
        db_session,
        question,
        code="OPT-A",
        label="旧選択肢",
        sort_order=1,
        is_active=False,
        llm_op={"weight": 0.1},
    )

    version_question = _make_version_question(
        db_session,
        version=version,
        question=question,
        admin_id=admin.id,
    )
    _make_version_option(
        db_session,
        version=version,
        version_question=version_question,
        option=option,
        admin_id=admin.id,
    )
    db_session.add(
        VersionOutcome(
            version_id=version.id,
            outcome_id=999,
            sort_order=5,
            is_active=False,
            outcome_meta_json={"name": "旧アウトカム"},
            created_by_admin_id=admin.id,
        )
    )
    db_session.flush()

    batch = seed_import_rows()
    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, file: batch,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["version_id"] == version.id
    assert payload["questions_imported"] == 1
    assert payload["options_imported"] == 1
    assert payload["outcomes_imported"] == 1
    warnings = payload["warnings"]
    assert batch.warnings[0] in warnings
    assert any("AIアーキテクト" in warning for warning in warnings)

    persisted_question = db_session.execute(
        select(Question).where(Question.diagnostic_id == diagnostic.id, Question.q_code == "Q100")
    ).scalar_one()
    assert persisted_question.display_text == "新しい質問テキスト"
    assert persisted_question.multi is False
    assert persisted_question.sort_order == 10
    assert persisted_question.is_active is True

    persisted_option = db_session.execute(
        select(Option).where(Option.question_id == persisted_question.id, Option.opt_code == "OPT-A")
    ).scalar_one()
    assert persisted_option.display_label == "新しい選択肢"
    assert persisted_option.sort_order == 1
    assert persisted_option.is_active is True
    assert persisted_option.llm_op == {"weight": 0.7}

    version_questions = db_session.execute(
        select(func.count()).select_from(VersionQuestion).where(VersionQuestion.version_id == version.id)
    ).scalar_one()
    assert version_questions == 1

    version_options = db_session.execute(
        select(func.count()).select_from(VersionOption).where(VersionOption.version_id == version.id)
    ).scalar_one()
    assert version_options == 1

    version_outcomes = db_session.execute(
        select(VersionOutcome).where(VersionOutcome.version_id == version.id)
    ).scalars().all()
    assert len(version_outcomes) == 1
    assert version_outcomes[0].outcome_meta_json == batch.outcomes[0].values
    assert version_outcomes[0].sort_order == 1
    assert version_outcomes[0].is_active is True
    assert version_outcomes[0].created_by_admin_id == admin.id

    audit_log = db_session.execute(
        select(DiagnosticVersionAuditLog)
        .where(DiagnosticVersionAuditLog.version_id == version.id, DiagnosticVersionAuditLog.action == "IMPORT")
        .order_by(DiagnosticVersionAuditLog.created_at.desc())
    ).scalar_one()
    new_value = json.loads(audit_log.new_value or "{}")
    assert new_value["questions"] == 1
    assert new_value["options"] == 1
    assert new_value["outcomes"] == 1
    assert batch.warnings[0] in new_value["warnings"]


def test_import_structure_rejects_finalised_version(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash="locked",
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.value


@pytest.mark.parametrize(
    "error_code,detail,invalid_cells",
    [
        (ErrorCode.DIAGNOSTICS_SHEET_MISSING, "questions シートが見つかりません", ["questions!A1"]),
        (ErrorCode.DIAGNOSTICS_COL_MISSING, "outcomes シートの列が不足しています", ["outcomes!B1"]),
    ],
)
def test_import_structure_returns_parser_errors(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    error_code: ErrorCode,
    detail: str,
    invalid_cells: list[str],
) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    def _raise(*_args, **_kwargs):
        raise StructureImportParseError(
            error_code=error_code,
            detail=detail,
            invalid_cells=invalid_cells,
        )

    monkeypatch.setattr(structure_importer.StructureImporter, "_parse_workbook", _raise)

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == error_code.http_status
    body = response.json()
    assert body["error"]["code"] == error_code.value
    assert body["error"]["detail"] == detail
    assert body["error"]["extra"]["invalid_cells"] == invalid_cells


def test_import_structure_validates_outcome_keys(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    batch = seed_import_rows()
    # Outcome row missing the required key triggers validation
    broken = StructureImportBatch(
        questions=batch.questions,
        options=batch.options,
        outcomes=[
            OutcomeImportRow(
                values={"role_summary": "missing name", "description": "invalid"},
                row_index=3,
            )
        ],
        warnings=[],
        outcome_headers=batch.outcome_headers,
    )

    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, file: broken,
    )

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.value
    assert "outcome" in body["error"]["detail"]
    assert "name" in body["error"]["detail"]


def test_import_structure_rolls_back_on_failure(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch):
    admin = AdminUserFactory(is_active=True)
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    question = _make_question(
        db_session,
        diagnostic.id,
        code="Q100",
        text="旧設問",
        multi=True,
        sort_order=1,
        is_active=False,
    )
    option = _make_option(
        db_session,
        question,
        code="OPT-A",
        label="旧選択肢",
        sort_order=1,
        is_active=False,
    )
    version_question = _make_version_question(
        db_session,
        version=version,
        question=question,
        admin_id=admin.id,
    )
    _make_version_option(
        db_session,
        version=version,
        version_question=version_question,
        option=option,
        admin_id=admin.id,
    )
    db_session.flush()

    batch = seed_import_rows()
    monkeypatch.setattr(
        structure_importer.StructureImporter,
        "_parse_workbook",
        lambda self, file: batch,
    )

    def _fail_options(self, *_args, **_kwargs):
        raise RuntimeError("forced failure")

    monkeypatch.setattr(structure_importer.StructureImporter, "_persist_options", _fail_options)

    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/structure/import",
        headers=_auth_header(admin.id),
        files={"file": ("structure.xlsx", io.BytesIO(_create_excel_bytes()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == ErrorCode.COMMON_UNEXPECTED_ERROR.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.COMMON_UNEXPECTED_ERROR.value

    # Original rows should remain due to rollback
    vq_count = db_session.execute(
        select(func.count()).select_from(VersionQuestion).where(VersionQuestion.version_id == version.id)
    ).scalar_one()
    assert vq_count == 1

    vo_count = db_session.execute(
        select(func.count()).select_from(VersionOption).where(VersionOption.version_id == version.id)
    ).scalar_one()
    assert vo_count == 1

    new_outcomes = db_session.execute(
        select(func.count()).select_from(VersionOutcome).where(VersionOutcome.version_id == version.id)
    ).scalar_one()
    assert new_outcomes == 0
