"""Additive schema migration at startup (SQLite + PostgreSQL safe).

`create_all` only creates missing *tables*, so columns added to existing tables
are applied here. Each ALTER runs in its own transaction and failures are
swallowed (logged) so one problem can never block the app from starting.

To add a column to an existing table, append it to ``COLUMN_ADDITIONS``.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table -> list of (column_name, DDL fragment). DDL must be portable.
COLUMN_ADDITIONS: dict[str, list[tuple[str, str]]] = {
    "users": [
        ("plants", "plants VARCHAR(200)"),
        ("hashed_password", "hashed_password VARCHAR(255) DEFAULT ''"),
        ("failed_attempts", "failed_attempts INTEGER DEFAULT 0"),
        ("locked", "locked BOOLEAN DEFAULT FALSE"),
        ("password_changed_at", "password_changed_at TIMESTAMP"),
        ("password_history", "password_history TEXT"),
        ("auth_source", "auth_source VARCHAR(20)"),
    ],
    "equipment": [
        ("system_id", "system_id VARCHAR(60)"),
        ("system_type", "system_type VARCHAR(40)"),
        ("make", "make VARCHAR(100)"),
        ("model_name", "model_name VARCHAR(100)"),
        ("application_name", "application_name VARCHAR(200)"),
        ("gamp_category", "gamp_category VARCHAR(10)"),
        ("usp_classification", "usp_classification VARCHAR(40)"),
        ("validation_status", "validation_status VARCHAR(30)"),
        ("initial_validation_date", "initial_validation_date DATE"),
        ("latest_validation_date", "latest_validation_date DATE"),
        ("periodic_review_frequency", "periodic_review_frequency INTEGER"),
        ("backup_include", "backup_include BOOLEAN DEFAULT FALSE"),
        ("computer_system_id", "computer_system_id VARCHAR(60)"),
        ("remarks", "remarks TEXT"),
        ("instrument_ids", "instrument_ids TEXT"),
    ],
    "audit_logs": [
        ("entity", "entity VARCHAR(80)"),
        ("field_name", "field_name VARCHAR(80)"),
        ("old_value", "old_value TEXT"),
        ("new_value", "new_value TEXT"),
        ("plant", "plant VARCHAR(20)"),
    ],
    "asset_creation_requests": [
        ("request_type", "request_type VARCHAR(10) DEFAULT 'CREATE'"),
        ("equipment_code", "equipment_code VARCHAR(20)"),
    ],
    "backup_schedule_entries": [
        ("backup_path", "backup_path TEXT"),
    ],
    "uam_requests": [
        ("auth_reason", "auth_reason TEXT"),
    ],
}


# Columns that became optional. PostgreSQL only; SQLite dev databases built
# before this change keep NOT NULL (recreate the local app.db if needed).
DROP_NOT_NULL: list[tuple[str, str]] = [
    ("equipment", "validation_date"),
]


def _existing_columns(engine: Engine, table: str) -> set[str]:
    return {col["name"] for col in inspect(engine).get_columns(table)}


def ensure_compatible_schema(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    for table, additions in COLUMN_ADDITIONS.items():
        if table not in tables:
            continue  # create_all will build it with every column
        existing = _existing_columns(engine, table)
        for col_name, ddl in additions:
            if col_name in existing:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
            except Exception as exc:  # noqa: BLE001 - never block startup
                print(f"[SCHEMA WARNING] could not add {table}.{col_name}: {exc}")
    if engine.dialect.name == "postgresql":
        for table, col in DROP_NOT_NULL:
            if table not in tables:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {col} DROP NOT NULL"))
            except Exception as exc:  # noqa: BLE001
                print(f"[SCHEMA WARNING] could not relax {table}.{col}: {exc}")
