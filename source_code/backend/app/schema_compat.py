"""SQLite-safe schema migration at startup.

SQLite does not support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we inspect
existing column names and only apply the DDL when the column is missing.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _existing_columns(engine: Engine, table: str) -> set[str]:
    insp = inspect(engine)
    return {col["name"] for col in insp.get_columns(table)}


def _add_if_missing(conn, table: str, col: str, ddl: str, existing: set[str]) -> None:
    if col not in existing:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def ensure_compatible_schema(engine: Engine) -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    with engine.begin() as conn:
        # --- users ---
        if "users" in tables:
            cols = _existing_columns(engine, "users")
            _add_if_missing(conn, "users", "plants", "plants VARCHAR(200)", cols)
            _add_if_missing(conn, "users", "hashed_password", "hashed_password VARCHAR(255) DEFAULT ''", cols)

        # --- equipment ---
        if "equipment" in tables:
            cols = _existing_columns(engine, "equipment")
            new_cols = [
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
                ("backup_include", "backup_include BOOLEAN DEFAULT 0"),
                ("computer_system_id", "computer_system_id VARCHAR(60)"),
                ("remarks", "remarks TEXT"),
            ]
            for col_name, ddl in new_cols:
                _add_if_missing(conn, "equipment", col_name, ddl, cols)
