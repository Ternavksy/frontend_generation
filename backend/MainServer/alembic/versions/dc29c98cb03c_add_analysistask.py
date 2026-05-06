"""Add AnalysisTask

Revision ID: dc29c98cb03c
Revises: 661574a4ea4d
Create Date: 2026-05-06 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "dc29c98cb03c"
down_revision: Union[str, Sequence[str], None] = "661574a4ea4d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    task_status = postgresql.ENUM(
        "queued",
        "processing",
        "completed",
        "failed",
        "cancelled",
        name="task_status",
        create_type=False,
    )
    task_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "analysis_tasks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("image_id", sa.UUID(), nullable=False),
        sa.Column("model_config_id", sa.Integer(), nullable=False),
        sa.Column("status", task_status, nullable=False),
        sa.Column("callback_token", sa.String(length=512), nullable=False),
        sa.Column("class_type_ids", sa.JSON(), nullable=False),
        sa.Column("result_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("ws_session_id", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"]),
        sa.ForeignKeyConstraint(["model_config_id"], ["models.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_analysis_tasks_callback_token"), "analysis_tasks", ["callback_token"], unique=True)
    op.create_index(op.f("ix_analysis_tasks_image_id"), "analysis_tasks", ["image_id"], unique=False)
    op.create_index(op.f("ix_analysis_tasks_status"), "analysis_tasks", ["status"], unique=False)
    op.create_index(op.f("ix_analysis_tasks_ws_session_id"), "analysis_tasks", ["ws_session_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_analysis_tasks_ws_session_id"), table_name="analysis_tasks")
    op.drop_index(op.f("ix_analysis_tasks_status"), table_name="analysis_tasks")
    op.drop_index(op.f("ix_analysis_tasks_image_id"), table_name="analysis_tasks")
    op.drop_index(op.f("ix_analysis_tasks_callback_token"), table_name="analysis_tasks")
    op.drop_table("analysis_tasks")
    sa.Enum(name="task_status").drop(op.get_bind(), checkfirst=True)
