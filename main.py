"""
datatools-portfolio: FastAPI backend for internal DataTools platform.
SQL-first, Supabase Postgres, audit logging, safe DDL/compare/validate.
"""
import json
import os
import re
import threading
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

import sqlglot
from sqlglot.expressions import Create, ColumnDef
from dotenv import load_dotenv
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from psycopg import Connection, connect
from openai import OpenAI

# Load .env from the directory containing this file (so it works regardless of cwd)
load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(
    title="DataTools Portfolio API",
    description="Internal DataTools platform: DDL parse/apply, compare, validate.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
def catch_all_exception_handler(request, exc: Exception):
    """Return JSON for unhandled exceptions so frontend can display the real error."""
    from fastapi.responses import JSONResponse
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    detail = str(exc)
    if "DATABASE_URL" in detail or "relation" in detail or "does not exist" in detail:
        detail += " Run scripts/setup_datatools_schema.sql in your database."
    return JSONResponse(status_code=500, content={"detail": detail})


@app.on_event("startup")
def ensure_deletion_schedule_table():
    """Create datatools schema and deletion_schedule table if they do not exist."""
    url = os.getenv("DATABASE_URL")
    if not url:
        return
    try:
        with connect(url) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("CREATE SCHEMA IF NOT EXISTS datatools")
                # Migrate compare_runs: add env_schema, compare_columns, status, error_message, left_env_schema, right_env_schema if missing
                for col, typ in [
                    ("env_schema", "TEXT NOT NULL DEFAULT 'dev'"),
                    ("left_env_schema", "TEXT"),
                    ("right_env_schema", "TEXT"),
                    ("left_pt", "TEXT"),
                    ("right_pt", "TEXT"),
                    ("compare_columns", "TEXT[]"),
                    ("status", "TEXT NOT NULL DEFAULT 'completed'"),
                    ("error_message", "TEXT"),
                ]:
                    try:
                        cur.execute(f"ALTER TABLE datatools.compare_runs ADD COLUMN IF NOT EXISTS {col} {typ}")
                    except Exception:
                        pass
                try:
                    cur.execute(
                        "ALTER TABLE datatools.table_registry ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
                    )
                except Exception:
                    pass
                for col, typ in [
                    ("env_schema", "TEXT NOT NULL DEFAULT 'dev'"),
                    ("status", "TEXT NOT NULL DEFAULT 'completed'"),
                    ("error_message", "TEXT"),
                ]:
                    try:
                        cur.execute(f"ALTER TABLE datatools.validation_runs ADD COLUMN IF NOT EXISTS {col} {typ}")
                    except Exception:
                        pass
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS datatools.deletion_schedule (
                        id BIGSERIAL PRIMARY KEY,
                        env_schema TEXT NOT NULL,
                        original_table_name TEXT NOT NULL,
                        renamed_table_name TEXT NOT NULL,
                        delete_after TIMESTAMPTZ NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                    """
                )
    except Exception:
        pass


DATABASE_URL = os.getenv("DATABASE_URL")
ALLOWED_SCHEMAS_STR = os.getenv("ALLOWED_SCHEMAS", "dev,prod")
ALLOWED_SCHEMAS = [s.strip() for s in ALLOWED_SCHEMAS_STR.split(",") if s.strip()]

IDENTIFIER_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")
DDL_FORBIDDEN = re.compile(
    r"\b(DROP|ALTER|TRUNCATE|COPY|GRANT|REVOKE)\b",
    re.IGNORECASE,
)
# Data governance: table name must be {layer}_josephco_{domain}_{tablename}_{granularity}
# layer=ods|dws|dim|ads|dwd, domain=trade|growth, granularity=di|df|hi|hf (underscores between each part)
TABLE_NAME_GOVERNANCE = re.compile(
    r"^(ods|dws|dim|ads|dwd)_josephco_(trade|growth)_[a-zA-Z0-9_]+_(di|df|hi|hf)$",
    re.IGNORECASE,
)


# ---------- Validation ----------


def validate_identifier(name: str) -> bool:
    """Allow only safe identifiers: letters, digits, underscore."""
    return bool(name and IDENTIFIER_RE.match(name))


def validate_env_schema(env_schema: str) -> None:
    if env_schema not in ALLOWED_SCHEMAS:
        raise HTTPException(
            status_code=400,
            detail=f"env_schema must be one of {ALLOWED_SCHEMAS}, got: {env_schema}",
        )


def validate_table_name(table_name: str) -> None:
    if not validate_identifier(table_name):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid table name: {table_name}. Use only [a-zA-Z_][a-zA-Z0-9_]*",
        )


def validate_table_name_governance(table_name: str) -> None:
    """Enforce naming: {ods|dws|dim|ads|dwd}_josephco_{trade|growth}_{tablename}_{di|df|hi|hf}."""
    if not table_name or not TABLE_NAME_GOVERNANCE.match(table_name):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Table name must follow data governance: "
                f"{{ods|dws|dim|ads|dwd}}_josephco_{{trade|growth}}_{{tablename}}_{{di|df|hi|hf}}. "
                f"Example: ods_josephco_growth_users_di. Got: {table_name!r}"
            ),
        )


# ---------- Database ----------


@contextmanager
def get_conn():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL not set")
    with connect(DATABASE_URL) as conn:
        conn.autocommit = False
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def audit_log(conn: Connection, action: str, env_schema: Optional[str], details: dict[str, Any]) -> None:
    """Write one row to datatools.audit_log."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO datatools.audit_log (action, env_schema, details)
            VALUES (%s, %s, %s::jsonb)
            """,
            (action, env_schema, json.dumps(details)),
        )


# ---------- DDL parsing (sqlglot) ----------


def parse_create_table(ddl: str) -> dict[str, Any]:
    """
    Parse a single CREATE TABLE statement. Returns dict with schema_in_ddl, table, columns, constraints.
    Raises ValueError if not exactly one CREATE TABLE.
    """
    ddl_stripped = (ddl or "").strip()
    if not ddl_stripped:
        raise ValueError("DDL is empty")

    parsed = sqlglot.parse(ddl_stripped, dialect="postgres")
    if not parsed or len(parsed) == 0:
        raise ValueError("Could not parse DDL")

    if len(parsed) > 1:
        raise ValueError("Only a single statement is allowed")

    stmt = parsed[0]
    if not isinstance(stmt, Create):
        raise ValueError("Only CREATE TABLE is supported")

    table_ref = stmt.this
    if table_ref is None:
        raise ValueError("CREATE TABLE has no table reference")

    # sqlglot may wrap in Schema (e.g. "dev"."users"); then table_ref.name is empty and table is in table_ref.this
    if not (getattr(table_ref, "name", None) or "").strip() and getattr(table_ref, "this", None) is not None:
        table_ref = table_ref.this
    # Table name and schema: Table has .name (identifier) and .db (schema identifier)
    table_name = table_ref.name if hasattr(table_ref, "name") else str(getattr(table_ref, "this", ""))
    db = getattr(table_ref, "db", None)
    schema_in_ddl = db.name if db and hasattr(db, "name") else (db if isinstance(db, str) else "public")

    columns = []
    constraints = []

    # Column definitions: use find_all(ColumnDef) to get every column in the tree
    for col in stmt.find_all(ColumnDef):
        col_this = col.this
        col_name = col_this.name if hasattr(col_this, "name") else str(col_this)
        kind = getattr(col, "kind", None)
        dtype = kind.sql(dialect="postgres") if kind else "TEXT"
        nullable = True
        default_val = None
        for c in col.args.get("constraints") or []:
            cname = type(c).__name__
            if "NotNull" in cname or "PrimaryKey" in cname:
                nullable = False
            if "Default" in cname:
                try:
                    default_val = c.sql(dialect="postgres")
                except Exception:
                    default_val = None
        columns.append({
            "name": col_name,
            "type": dtype,
            "nullable": nullable,
            "default": default_val,
        })

    # Table-level constraints (e.g. PRIMARY KEY (id), UNIQUE (x)) - non-ColumnDef expressions in body
    expr = stmt.expression
    if expr and hasattr(expr, "expressions"):
        for child in expr.expressions:
            if not isinstance(child, ColumnDef):
                constraints.append({"raw": child.sql(dialect="postgres")})

    return {
        "schema_in_ddl": schema_in_ddl,
        "table": table_name,
        "columns": columns,
        "constraints": constraints,
    }


def build_create_table_sql(env_schema: str, table_name: str, parsed: dict[str, Any]) -> str:
    """Build CREATE TABLE schema_name.table_name (...) from parsed columns/constraints."""
    cols = parsed.get("columns") or []
    parts = [f'CREATE TABLE "{env_schema}"."{table_name}" (']
    col_defs = []
    for c in cols:
        name = c.get("name", "")
        typ = c.get("type", "text")
        nullable = c.get("nullable", True)
        default = c.get("default")
        seg = f'"{name}" {typ}'
        if not nullable:
            seg += " NOT NULL"
        if default:
            seg += " " + (default if str(default).upper().strip().startswith("DEFAULT") else f"DEFAULT {default}")
        col_defs.append(seg)
    for con in parsed.get("constraints") or []:
        col_defs.append(con.get("raw", ""))
    parts.append(", ".join(col_defs))
    parts.append(")")
    return "\n".join(parts)


# ---------- Request/Response models ----------


class DdlParseRequest(BaseModel):
    ddl: str = Field(..., description="CREATE TABLE statement")


class ColumnCommentInput(BaseModel):
    column_name: str
    comment_en: str = ""
    comment_zh: str = ""


class DdlApplyRequest(BaseModel):
    ddl: str = Field(..., description="CREATE TABLE statement")
    env_schema: str = Field(..., description="Target schema: dev or prod")
    column_comments: Optional[list[ColumnCommentInput]] = Field(
        default=None,
        description="Per-column comments (EN + ZH required by governance)",
    )


class SuggestColumnCommentsRequest(BaseModel):
    columns: list[dict[str, Any]] = Field(..., description="List of {name, type} for each column")
    table_name: Optional[str] = Field(default=None, description="Optional table name for context")


class SuggestTableNameRequest(BaseModel):
    ddl: str = Field(..., description="CREATE TABLE statement to infer table purpose from columns")


class CompareSuggestKeysRequest(BaseModel):
    left_table: str
    right_table: str
    left_pt: Optional[str] = Field(None, min_length=8, max_length=12, description="Partition: 20260101 (daily) or 2026010123 (hourly)")
    right_pt: Optional[str] = Field(None, min_length=8, max_length=12, description="Partition: 20260101 (daily) or 2026010123 (hourly)")
    left_env_schema: Optional[str] = None
    right_env_schema: Optional[str] = None
    env_schema: Optional[str] = None  # backward compat
    max_candidates: int = Field(default=5, ge=1, le=20)


class ColumnPair(BaseModel):
    left: str
    right: str


class CompareRunRequest(BaseModel):
    left_table: str
    right_table: str
    left_pt: Optional[str] = Field(None, min_length=8, max_length=12, description="Partition: 20260101 (daily) or 2026010123 (hourly)")
    right_pt: Optional[str] = Field(None, min_length=8, max_length=12, description="Partition: 20260101 (daily) or 2026010123 (hourly)")
    left_env_schema: Optional[str] = None
    right_env_schema: Optional[str] = None
    env_schema: Optional[str] = None  # backward compat
    join_keys: Optional[list[str]] = None  # backward compat: same-name keys
    join_key_pairs: Optional[list[ColumnPair]] = None  # [{left, right}] manual mapping
    compare_columns: Optional[list[str]] = None
    compare_column_pairs: Optional[list[ColumnPair]] = None  # [{left, right}] manual mapping
    sample_limit: int = Field(default=50, ge=1, le=1000)


class ValidateRunRequest(BaseModel):
    target_table: str
    env_schema: str


class ScheduleDeleteRequest(BaseModel):
    env_schema: str
    table_name: str


class RestoreBackupRequest(BaseModel):
    env_schema: str
    table_name: str  # backup table name, e.g. back_up_users_20260224


class RunQueryRequest(BaseModel):
    sql: str = Field(..., min_length=1, description="Single SELECT statement only")


# ---------- Endpoints ----------


@app.post("/ddl/parse")
def ddl_parse(req: DdlParseRequest):
    """Parse CREATE TABLE DDL and return schema, table, columns, constraints."""
    try:
        result = parse_create_table(req.ddl)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@app.post("/ddl/suggest-column-comments")
def suggest_column_comments(req: SuggestColumnCommentsRequest):
    """Use AI to generate English and Chinese column comments. Requires OPENAI_API_KEY in .env."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set. Add it to .env to use AI-generated comments.",
        )
    columns = req.columns or []
    if not columns:
        return {"suggestions": []}
    table_context = f" (table: {req.table_name})" if req.table_name else ""
    col_list = "\n".join(
        f"- {c.get('name', '')} ({c.get('type', '')})" for c in columns if c.get("name")
    )
    prompt = f"""Generate a short column comment in English and in Chinese for each column.
Table context:{table_context}
Columns:
{col_list}

Return a JSON array only, no other text. Each item: {{"column_name": "<name>", "comment_en": "<short English comment>", "comment_zh": "<简短中文注释>"}}
Example: [{{"column_name": "id", "comment_en": "Primary key identifier.", "comment_zh": "主键标识。"}}]"""
    try:
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        text = (resp.choices[0].message.content or "").strip()
        # Strip markdown code block if present
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rstrip().removesuffix("```").strip()
        suggestions = json.loads(text)
        if not isinstance(suggestions, list):
            suggestions = []
        # Ensure we have column_name, comment_en, comment_zh for each
        out = []
        for s in suggestions:
            if isinstance(s, dict) and s.get("column_name"):
                out.append({
                    "column_name": str(s["column_name"]),
                    "comment_en": str(s.get("comment_en", "")),
                    "comment_zh": str(s.get("comment_zh", "")),
                })
        return {"suggestions": out}
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {e!s}") from e
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI suggestion failed: {e!s}") from e


@app.post("/ddl/suggest-table-name")
def suggest_table_name(req: SuggestTableNameRequest):
    """Use AI to suggest a table name following governance: {ods|dws|dim|ads|dwd}_josephco_{trade|growth}_{tablename}_{di|df|hi|hf}. Requires OPENAI_API_KEY in .env."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not set. Add it to .env to use AI-suggested table names.",
        )
    try:
        parsed = parse_create_table(req.ddl)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    current_table = (parsed.get("table") or "").strip()
    schema_in_ddl = (parsed.get("schema_in_ddl") or "dev").strip()
    columns = parsed.get("columns") or []
    col_list = "\n".join(
        f"- {c.get('name', '')} ({c.get('type', '')})" for c in columns if c.get("name")
    )
    prompt = f"""Given this table definition, suggest a single table name that follows this exact pattern:
{{layer}}_josephco_{{domain}}_{{tablename}}_{{granularity}}

Rules:
- layer: one of ods, dws, dim, ads, dwd (ods=raw/source, dws=summary, dim=dimension, ads=application, dwd=warehouse detail)
- domain: trade or growth
- tablename: lowercase alphanumeric + underscore, descriptive of the data
- granularity: di (daily incremental), df (daily full), hi (hourly incremental), hf (hourly full)

Current table name (may be non-compliant): {current_table}
Columns:
{col_list}

Return ONLY the suggested table name, nothing else. No quotes, no explanation. Example: ods_josephco_trade_kline_candles_di"""
    try:
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        suggested = (resp.choices[0].message.content or "").strip().strip('"\'')
        if suggested:
            # Extract compliant name if AI added extra text (e.g. "Name: ods_josephco_trade_..._di")
            match = TABLE_NAME_GOVERNANCE.search(suggested)
            if match:
                suggested = match.group(0)
        if not TABLE_NAME_GOVERNANCE.match(suggested):
            raise HTTPException(
                status_code=502,
                detail=f"AI suggested name does not match governance: {suggested}. Please choose manually.",
            )
        return {
            "suggested_name": suggested,
            "current_table_name": current_table,
            "schema_in_ddl": schema_in_ddl,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI suggestion failed: {e!s}") from e


@app.post("/ddl/apply")
def ddl_apply(req: DdlApplyRequest):
    """Validate env_schema, parse DDL, force schema, execute CREATE TABLE, upsert table_registry, audit."""
    validate_env_schema(req.env_schema)
    if DDL_FORBIDDEN.search(req.ddl):
        raise HTTPException(
            status_code=400,
            detail="DDL must not contain DROP, ALTER, TRUNCATE, COPY, GRANT, REVOKE",
        )
    try:
        parsed = parse_create_table(req.ddl)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    table_name = parsed.get("table") or ""
    if not validate_identifier(table_name):
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    validate_table_name_governance(table_name)

    # Data governance: every column must have both English and Chinese comment
    columns = parsed.get("columns") or []
    comments_by_col = {c.column_name.strip(): c for c in (req.column_comments or []) if c.column_name}
    missing = []
    for col in columns:
        cname = col.get("name", "")
        cc = comments_by_col.get(cname)
        if not cc or not (cc.comment_en and cc.comment_en.strip()) or not (cc.comment_zh and cc.comment_zh.strip()):
            missing.append(cname)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Data governance: each column must have both English and Chinese comments. Missing or empty for: {missing}. Use 'Generate comments with AI' or fill Comment (EN) and Comment (ZH) for every column.",
        )

    applied_sql = build_create_table_sql(req.env_schema, table_name, parsed)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(applied_sql)
            # COMMENT ON COLUMN for each column (Postgres allows one comment per column; store "EN: ... | ZH: ...")
            for col in columns:
                cname = col.get("name", "")
                cc = comments_by_col.get(cname)
                if cc and cc.comment_en and cc.comment_zh:
                    combined = f"EN: {cc.comment_en.strip()} | ZH: {cc.comment_zh.strip()}"
                    # Escape single quotes for SQL: ' -> ''
                    combined_escaped = combined.replace("'", "''")
                    comment_sql = f'COMMENT ON COLUMN "{req.env_schema}"."{table_name}"."{cname}" IS \'{combined_escaped}\''
                    with conn.cursor() as c2:
                        c2.execute(comment_sql)
            # Upsert table_registry(env_schema, table_name, ddl, parsed_json)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO datatools.table_registry (env_schema, table_name, ddl, parsed_json)
                    VALUES (%s, %s, %s, %s::jsonb)
                    ON CONFLICT (env_schema, table_name)
                    DO UPDATE SET ddl = EXCLUDED.ddl, parsed_json = EXCLUDED.parsed_json
                    """,
                    (req.env_schema, table_name, req.ddl, json.dumps(parsed)),
                )
            audit_log(conn, "ddl_apply", req.env_schema, {
                "env_schema": req.env_schema,
                "table": table_name,
                "applied_sql": applied_sql,
            })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {e!s}. If you see 'relation datatools.audit_log does not exist', run the SQL in scripts/setup_datatools_schema.sql in your Supabase SQL editor.",
        ) from e

    return {"status": "ok", "applied_sql": applied_sql}


def _pt_where(pt: Optional[str]) -> str:
    """Return SQL fragment for partition filter, e.g. ' AND "pt" = %s' or ''."""
    if not pt or len(pt) < 8:
        return ""
    return ' AND "pt" = %s'


@app.post("/compare/suggest-keys")
def compare_suggest_keys(req: CompareSuggestKeysRequest):
    """Find common columns by name+type, score by uniqueness and null ratio, return top N."""
    left_env = req.left_env_schema or req.env_schema or "dev"
    right_env = req.right_env_schema or req.env_schema or "dev"
    validate_env_schema(left_env)
    validate_env_schema(right_env)
    validate_table_name(req.left_table)
    validate_table_name(req.right_table)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Common columns: same name in both tables (match by name only; dev/prod may have
            # slightly different data_type e.g. text vs character varying - both are comparable)
            cur.execute(
                """
                SELECT a.column_name, a.data_type
                FROM information_schema.columns a
                JOIN information_schema.columns b
                  ON a.column_name = b.column_name
                WHERE a.table_schema = %s AND a.table_name = %s
                  AND b.table_schema = %s AND b.table_name = %s
                ORDER BY a.ordinal_position
                """,
                (left_env, req.left_table, right_env, req.right_table),
            )
            common = cur.fetchall()

        if not common:
            audit_log(conn, "compare_suggest_keys", left_env, {
                "left_table": req.left_table,
                "right_table": req.right_table,
                "candidates": [],
            })
            return {"candidates": []}

        left_pt_where = _pt_where(req.left_pt)
        right_pt_where = _pt_where(req.right_pt)

        candidates = []
        for (col_name, data_type) in common:
            if not validate_identifier(col_name):
                continue
            with conn.cursor() as cur:
                if left_pt_where and right_pt_where:
                    cur.execute(
                        f"""
                        SELECT
                          ({left_base} WHERE 1=1{left_pt_where}) AS left_rows,
                          ({right_base} WHERE 1=1{right_pt_where}) AS right_rows,
                          (SELECT COUNT(DISTINCT "{col_name}") FROM "{left_env}"."{req.left_table}" WHERE 1=1{left_pt_where}) AS left_distinct,
                          (SELECT COUNT(*) - COUNT("{col_name}") FROM "{left_env}"."{req.left_table}" WHERE 1=1{left_pt_where}) AS left_nulls,
                          (SELECT COUNT(DISTINCT "{col_name}") FROM "{right_env}"."{req.right_table}" WHERE 1=1{right_pt_where}) AS right_distinct,
                          (SELECT COUNT(*) - COUNT("{col_name}") FROM "{right_env}"."{req.right_table}" WHERE 1=1{right_pt_where}) AS right_nulls
                        """,
                        (req.left_pt, req.right_pt, req.left_pt, req.left_pt, req.right_pt, req.right_pt),
                    )
                else:
                    cur.execute(
                        f"""
                        SELECT
                          (SELECT COUNT(*) FROM "{left_env}"."{req.left_table}") AS left_rows,
                          (SELECT COUNT(*) FROM "{right_env}"."{req.right_table}") AS right_rows,
                          (SELECT COUNT(DISTINCT "{col_name}") FROM "{left_env}"."{req.left_table}") AS left_distinct,
                          (SELECT COUNT(*) - COUNT("{col_name}") FROM "{left_env}"."{req.left_table}") AS left_nulls,
                          (SELECT COUNT(DISTINCT "{col_name}") FROM "{right_env}"."{req.right_table}") AS right_distinct,
                          (SELECT COUNT(*) - COUNT("{col_name}") FROM "{right_env}"."{req.right_table}") AS right_nulls
                        """,
                    )
                row = cur.fetchone()
            if not row or row[0] == 0 or row[1] == 0:
                uniq_score = 0.0
                null_penalty = 0.0
            else:
                left_rows, right_rows = int(row[0]), int(row[1])
                left_distinct, left_nulls = int(row[2]), int(row[3])
                right_distinct, right_nulls = int(row[4]), int(row[5])
                uniq_score = min(left_distinct / left_rows, right_distinct / right_rows)
                null_penalty = (left_nulls / left_rows) + (right_nulls / right_rows)
                uniq_score = min(uniq_score, 1.0)
            score = max(0.0, uniq_score - null_penalty)
            candidates.append({
                "column": col_name,
                "data_type": data_type,
                "score": round(score, 4),
            })

        candidates.sort(key=lambda x: -x["score"])
        top = candidates[: req.max_candidates]

        audit_log(conn, "compare_suggest_keys", left_env, {
            "left_table": req.left_table,
            "right_table": req.right_table,
            "candidates": top,
        })

    return {"candidates": top}


def _run_compare_background(run_id: int, job: dict) -> None:
    """Background job: run comparison and update compare_runs row."""
    try:
        with get_conn() as conn:
            conn.autocommit = False
            left_env = job["left_env"]
            right_env = job["right_env"]
            left_table = job["left_table"]
            right_table = job["right_table"]
            left_pt_val = job.get("left_pt")
            right_pt_val = job.get("right_pt")
            join_on = job["join_on"]
            pairs = [tuple(p) for p in job["pairs"]]
            k0_left, k0_right = job["k0_left"], job["k0_right"]
            compare_pairs = [tuple(p) for p in job.get("compare_pairs", [])]
            sample_limit = job.get("sample_limit", 50)
            pt_cond_l = f' AND l."pt" = %s' if left_pt_val else ''
            pt_cond_r = f' AND r."pt" = %s' if right_pt_val else ''

            with conn.cursor() as cur:
                if pt_cond_l and pt_cond_r:
                    cur.execute(
                        f'SELECT COUNT(*) FROM "{left_env}"."{left_table}" WHERE 1=1 AND "pt" = %s',
                        (left_pt_val,),
                    )
                    left_count = cur.fetchone()[0]
                    cur.execute(
                        f'SELECT COUNT(*) FROM "{right_env}"."{right_table}" WHERE 1=1 AND "pt" = %s',
                        (right_pt_val,),
                    )
                    right_count = cur.fetchone()[0]
                else:
                    cur.execute(f'SELECT COUNT(*) FROM "{left_env}"."{left_table}"')
                    left_count = cur.fetchone()[0]
                    cur.execute(f'SELECT COUNT(*) FROM "{right_env}"."{right_table}"')
                    right_count = cur.fetchone()[0]

                if pt_cond_l and pt_cond_r:
                    cur.execute(
                        f"""
                        SELECT COUNT(*) FROM "{left_env}"."{left_table}" l
                        LEFT JOIN "{right_env}"."{right_table}" r ON {join_on} AND r."pt" = %s
                        WHERE r."{k0_right}" IS NULL AND l."pt" = %s
                        """,
                        (right_pt_val, left_pt_val),
                    )
                    missing_in_right = cur.fetchone()[0]
                    cur.execute(
                        f"""
                        SELECT COUNT(*) FROM "{right_env}"."{right_table}" r
                        LEFT JOIN "{left_env}"."{left_table}" l ON {join_on} AND l."pt" = %s
                        WHERE l."{k0_left}" IS NULL AND r."pt" = %s
                        """,
                        (left_pt_val, right_pt_val),
                    )
                    missing_in_left = cur.fetchone()[0]
                    sample_cols = ", ".join(f'l."{lk}" AS left_{lk}, r."{rk}" AS right_{rk}' for lk, rk in pairs)
                    cur.execute(
                        f"""
                        SELECT {sample_cols}
                        FROM "{left_env}"."{left_table}" l
                        FULL OUTER JOIN "{right_env}"."{right_table}" r
                          ON {join_on} AND l."pt" = %s AND r."pt" = %s
                        WHERE l."{k0_left}" IS NULL OR r."{k0_right}" IS NULL
                        LIMIT %s
                        """,
                        (left_pt_val, right_pt_val, sample_limit),
                    )
                else:
                    cur.execute(
                        f"""
                        SELECT COUNT(*) FROM "{left_env}"."{left_table}" l
                        LEFT JOIN "{right_env}"."{right_table}" r ON {join_on}
                        WHERE r."{k0_right}" IS NULL
                        """,
                    )
                    missing_in_right = cur.fetchone()[0]
                    cur.execute(
                        f"""
                        SELECT COUNT(*) FROM "{right_env}"."{right_table}" r
                        LEFT JOIN "{left_env}"."{left_table}" l ON {join_on}
                        WHERE l."{k0_left}" IS NULL
                        """,
                    )
                    missing_in_left = cur.fetchone()[0]
                    sample_cols = ", ".join(f'l."{lk}" AS left_{lk}, r."{rk}" AS right_{rk}' for lk, rk in pairs)
                    cur.execute(
                        f"""
                        SELECT {sample_cols}
                        FROM "{left_env}"."{left_table}" l
                        FULL OUTER JOIN "{right_env}"."{right_table}" r ON {join_on}
                        WHERE l."{k0_left}" IS NULL OR r."{k0_right}" IS NULL
                        LIMIT %s
                        """,
                        (sample_limit,),
                    )
                rows = cur.fetchall()
                col_names = [d[0] for d in cur.description]
                sample = [dict(zip(col_names, r)) for r in rows]

                column_diffs = []
                if compare_pairs and (pt_cond_l and pt_cond_r or (not pt_cond_l and not pt_cond_r)):
                    for lk, rk in compare_pairs:
                        if not validate_identifier(lk) or not validate_identifier(rk):
                            continue
                        if pt_cond_l and pt_cond_r:
                            cur.execute(
                                f"""
                                SELECT COUNT(*) AS total,
                                    SUM(CASE WHEN l."{lk}" IS DISTINCT FROM r."{rk}" THEN 1 ELSE 0 END) AS diff_count
                                FROM "{left_env}"."{left_table}" l
                                INNER JOIN "{right_env}"."{right_table}" r
                                  ON {join_on} AND l."pt" = %s AND r."pt" = %s
                                """,
                                (left_pt_val, right_pt_val),
                            )
                            tot_row = cur.fetchone()
                            total_compared = tot_row[0] if tot_row else 0
                            diff_count = tot_row[1] if tot_row and tot_row[1] is not None else 0
                            cur.execute(
                                f"""
                                SELECT l."{lk}" AS left_val, r."{rk}" AS right_val,
                                    {", ".join(f'l."{lk2}"' for lk2, _ in pairs)}
                                FROM "{left_env}"."{left_table}" l
                                INNER JOIN "{right_env}"."{right_table}" r
                                  ON {join_on} AND l."pt" = %s AND r."pt" = %s
                                WHERE l."{lk}" IS DISTINCT FROM r."{rk}"
                                LIMIT %s
                                """,
                                (left_pt_val, right_pt_val, min(20, sample_limit)),
                            )
                        else:
                            cur.execute(
                                f"""
                                SELECT COUNT(*) AS total,
                                    SUM(CASE WHEN l."{lk}" IS DISTINCT FROM r."{rk}" THEN 1 ELSE 0 END) AS diff_count
                                FROM "{left_env}"."{left_table}" l
                                INNER JOIN "{right_env}"."{right_table}" r ON {join_on}
                                """,
                            )
                            tot_row = cur.fetchone()
                            total_compared = tot_row[0] if tot_row else 0
                            diff_count = tot_row[1] if tot_row and tot_row[1] is not None else 0
                            cur.execute(
                                f"""
                                SELECT l."{lk}" AS left_val, r."{rk}" AS right_val,
                                    {", ".join(f'l."{lk2}"' for lk2, _ in pairs)}
                                FROM "{left_env}"."{left_table}" l
                                INNER JOIN "{right_env}"."{right_table}" r ON {join_on}
                                WHERE l."{lk}" IS DISTINCT FROM r."{rk}"
                                LIMIT %s
                                """,
                                (min(20, sample_limit),),
                            )
                        diff_rows = cur.fetchall()
                        diff_cols = [d[0] for d in cur.description]
                        diff_sample = [dict(zip(diff_cols, r)) for r in diff_rows]
                        column_diffs.append({
                            "left_col": lk,
                            "right_col": rk,
                            "total_compared": int(total_compared or 0),
                            "diff_count": int(diff_count or 0),
                            "sample": diff_sample,
                        })

            result_json = {
                "left_count": int(left_count),
                "right_count": int(right_count),
                "missing_in_right": int(missing_in_right),
                "missing_in_left": int(missing_in_left),
                "sample": sample,
                "column_diffs": column_diffs or [],
            }

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE datatools.compare_runs
                    SET result_json = %s::jsonb, status = 'completed'
                    WHERE id = %s
                    """,
                    (json.dumps(result_json), run_id),
                )
            audit_log(conn, "compare_run_completed", left_env, {"run_id": run_id, "left_table": left_table, "right_table": right_table})
            conn.commit()
    except Exception as e:
        err_msg = str(e)
        try:
            with get_conn() as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE datatools.compare_runs SET status = 'error', error_message = %s WHERE id = %s",
                        (err_msg, run_id),
                    )
        except Exception:
            pass


@app.post("/compare/run")
def compare_run(req: CompareRunRequest):
    """Queue comparison job, return run_id immediately. Comparison runs in background."""
    left_env = req.left_env_schema or req.env_schema or "dev"
    right_env = req.right_env_schema or req.env_schema or "dev"
    validate_env_schema(left_env)
    validate_env_schema(right_env)
    validate_table_name(req.left_table)
    validate_table_name(req.right_table)
    left_pt_where = _pt_where(req.left_pt)
    right_pt_where = _pt_where(req.right_pt)

    if req.join_key_pairs and len(req.join_key_pairs) > 0:
        pairs = [(p.left.strip(), p.right.strip()) for p in req.join_key_pairs if p.left and p.right]
        if not pairs:
            raise HTTPException(status_code=400, detail="At least one join key pair (left, right) required")
        for left_k, right_k in pairs:
            if not validate_identifier(left_k) or not validate_identifier(right_k):
                raise HTTPException(status_code=400, detail=f"Invalid join key: {left_k} ↔ {right_k}")
        join_on = " AND ".join(f'l."{lk}" = r."{rk}"' for lk, rk in pairs)
        k0_left, k0_right = pairs[0]
        stored_join_keys = [f"{lk}:{rk}" for lk, rk in pairs]
    elif req.join_keys and len(req.join_keys) > 0:
        for k in req.join_keys:
            if not validate_identifier(k):
                raise HTTPException(status_code=400, detail=f"Invalid join key: {k}")
        pairs = [(k, k) for k in req.join_keys]
        join_on = " AND ".join(f'l."{k}" = r."{k}"' for k in req.join_keys)
        k0_left = k0_right = req.join_keys[0]
        stored_join_keys = req.join_keys
    else:
        raise HTTPException(status_code=400, detail="At least one join key required (use join_key_pairs or join_keys)")

    compare_pairs = []
    if req.compare_column_pairs and len(req.compare_column_pairs) > 0:
        compare_pairs = [(p.left.strip(), p.right.strip()) for p in req.compare_column_pairs if p.left and p.right]
    stored_compare = [f"{l}:{r}" for l, r in compare_pairs] if compare_pairs else (req.compare_columns or [])

    left_pt_val = req.left_pt if left_pt_where else None
    right_pt_val = req.right_pt if right_pt_where else None

    with get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO datatools.compare_runs
                (left_table, right_table, left_env_schema, right_env_schema, left_pt, right_pt, env_schema, join_keys, compare_columns, result_json, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::text[], %s::text[], '{}'::jsonb, 'pending')
                RETURNING id
                """,
                (req.left_table, req.right_table, left_env, right_env, req.left_pt, req.right_pt, left_env, stored_join_keys, stored_compare),
            )
            run_id = cur.fetchone()[0]

    job = {
        "left_env": left_env,
        "right_env": right_env,
        "left_table": req.left_table,
        "right_table": req.right_table,
        "left_pt": left_pt_val,
        "right_pt": right_pt_val,
        "join_on": join_on,
        "pairs": [list(p) for p in pairs],
        "k0_left": k0_left,
        "k0_right": k0_right,
        "compare_pairs": [list(p) for p in compare_pairs],
        "sample_limit": req.sample_limit,
    }
    threading.Thread(target=_run_compare_background, args=(run_id, job), daemon=True).start()

    return {"run_id": run_id, "status": "pending"}


@app.get("/compare/runs")
def compare_list_runs(
    env_schema: Optional[str] = Query(None, description="Filter by env (dev/prod)"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List comparison runs with status (completed, error)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if env_schema:
                validate_env_schema(env_schema)
                cur.execute(
                    """
                    SELECT id, left_table, right_table, env_schema, left_env_schema, right_env_schema,
                           left_pt, right_pt, join_keys, compare_columns, result_json, status, error_message, created_at
                    FROM datatools.compare_runs
                    WHERE COALESCE(left_env_schema, env_schema) = %s OR COALESCE(right_env_schema, env_schema) = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (env_schema, env_schema, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, left_table, right_table, env_schema, left_env_schema, right_env_schema,
                           left_pt, right_pt, join_keys, compare_columns, result_json, status, error_message, created_at
                    FROM datatools.compare_runs
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()
    runs = []
    for r in rows:
        rid, left, right, schema, left_schema, right_schema, left_pt, right_pt, keys, comp_cols, result, status, err, created = r
        runs.append({
            "id": rid,
            "left_table": left,
            "right_table": right,
            "env_schema": schema or "dev",
            "left_env_schema": left_schema or schema or "dev",
            "right_env_schema": right_schema or schema or "dev",
            "left_pt": left_pt,
            "right_pt": right_pt,
            "join_keys": keys or [],
            "compare_columns": comp_cols or [],
            "result_json": result,
            "status": status or "completed",
            "error_message": err,
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        })
    return {"runs": runs}


@app.get("/compare/runs/{run_id:int}")
def compare_get_run(run_id: int):
    """Get a single comparison run (for polling status)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, left_table, right_table, env_schema, left_env_schema, right_env_schema,
                       left_pt, right_pt, join_keys, compare_columns, result_json, status, error_message, created_at
                FROM datatools.compare_runs
                WHERE id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    rid, left, right, schema, left_schema, right_schema, left_pt, right_pt, keys, comp_cols, result, status, err, created = row
    return {
        "id": rid,
        "left_table": left,
        "right_table": right,
        "env_schema": schema or "dev",
        "left_env_schema": left_schema or schema or "dev",
        "right_env_schema": right_schema or schema or "dev",
        "left_pt": left_pt,
        "right_pt": right_pt,
        "join_keys": keys or [],
        "compare_columns": comp_cols or [],
        "result_json": result,
        "status": status or "completed",
        "error_message": err,
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


def _run_validate_background(run_id: int, target_table: str, env_schema: str) -> None:
    """Background job: run validation and update validation_runs row."""
    try:
        with get_conn() as conn:
            conn.autocommit = False
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (env_schema, target_table),
                )
                columns = [{"name": r[0], "data_type": r[1]} for r in cur.fetchall()]

            if not columns:
                raise ValueError(f"Table {env_schema}.{target_table} not found or has no columns")

            full_name = f'"{env_schema}"."{target_table}"'
            null_counts: list[dict] = []

            # Total row count
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {full_name}")
                total_rows = cur.fetchone()[0]

            # Null count per column
            for col in columns:
                cname = col["name"]
                if not validate_identifier(cname):
                    continue
                with conn.cursor() as cur:
                    cur.execute(f'SELECT COUNT(*) - COUNT("{cname}") FROM {full_name}')
                    null_count = cur.fetchone()[0]
                null_counts.append({"column": cname, "null_count": int(null_count or 0)})

            # Duplicate rows (full row duplicates)
            col_list = ", ".join(f'"{c["name"]}"' for c in columns if validate_identifier(c["name"]))
            if col_list:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT (SELECT COUNT(*) FROM {full_name})
                             - (SELECT COUNT(*) FROM (SELECT DISTINCT {col_list} FROM {full_name}) x)
                        """
                    )
                    duplicate_rows = cur.fetchone()[0] or 0
            else:
                duplicate_rows = 0

            result_json = {
                "total_rows": int(total_rows),
                "null_counts": null_counts,
                "duplicate_rows": int(duplicate_rows),
            }

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE datatools.validation_runs
                    SET result_json = %s::jsonb, status = 'completed'
                    WHERE id = %s
                    """,
                    (json.dumps(result_json), run_id),
                )
            audit_log(conn, "validate_run", env_schema, {"run_id": run_id, "target_table": target_table})
            conn.commit()
    except Exception as e:
        err_msg = str(e)
        try:
            with get_conn() as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE datatools.validation_runs SET status = 'error', error_message = %s WHERE id = %s",
                        (err_msg, run_id),
                    )
        except Exception:
            pass


@app.post("/validate/run")
def validate_run(req: ValidateRunRequest):
    """Queue validation job, return run_id immediately. Validation runs in background."""
    validate_env_schema(req.env_schema)
    validate_table_name(req.target_table)

    with get_conn() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO datatools.validation_runs (target_table, env_schema, result_json, status)
                VALUES (%s, %s, '{}'::jsonb, 'pending')
                RETURNING id
                """,
                (req.target_table, req.env_schema),
            )
            run_id = cur.fetchone()[0]

    threading.Thread(target=_run_validate_background, args=(run_id, req.target_table, req.env_schema), daemon=True).start()
    return {"run_id": run_id, "status": "pending"}


@app.get("/validate/runs")
def validate_list_runs(
    env_schema: Optional[str] = Query(None, description="Filter by env (dev/prod)"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List validation runs with status."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            if env_schema:
                validate_env_schema(env_schema)
                cur.execute(
                    """
                    SELECT id, target_table, env_schema, result_json, status, error_message, created_at
                    FROM datatools.validation_runs
                    WHERE env_schema = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (env_schema, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, target_table, env_schema, result_json, status, error_message, created_at
                    FROM datatools.validation_runs
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()
    runs = []
    for r in rows:
        rid, target, schema, result, status, err, created = r
        runs.append({
            "id": rid,
            "target_table": target,
            "env_schema": schema or "dev",
            "result_json": result,
            "status": status or "completed",
            "error_message": err,
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
        })
    return {"runs": runs}


@app.get("/validate/runs/{run_id:int}")
def validate_get_run(run_id: int):
    """Get a single validation run (for polling status)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, target_table, env_schema, result_json, status, error_message, created_at
                FROM datatools.validation_runs
                WHERE id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    rid, target, schema, result, status, err, created = row
    return {
        "id": rid,
        "target_table": target,
        "env_schema": schema or "dev",
        "result_json": result,
        "status": status or "completed",
        "error_message": err,
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Assets ----------


@app.get("/assets/tables")
def assets_list_tables(
    env_schema: Optional[str] = None,
    filter_type: Optional[str] = Query(None, alias="filter"),
    q: Optional[str] = None,
):
    """List tables. filter: tables (registry), backups (back_up_%), to_be_deleted (to_be_deleted_%). env_schema: dev|prod. q: search substring."""
    filter_type = (filter_type or "tables").lower()
    if filter_type not in ("tables", "backups", "to_be_deleted"):
        filter_type = "tables"
    schemas = [env_schema] if env_schema and env_schema in ALLOWED_SCHEMAS else list(ALLOWED_SCHEMAS)
    search = (q or "").strip().lower()
    out = []
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                if filter_type == "tables":
                    placeholders = ",".join("%s" for _ in schemas)
                    try:
                        cur.execute(
                            f"""
                            SELECT env_schema, table_name, created_at FROM datatools.table_registry
                            WHERE env_schema IN ({placeholders})
                              AND table_name NOT LIKE 'back_up_%%'
                              AND table_name NOT LIKE 'to_be_deleted_%%'
                            ORDER BY env_schema, table_name
                            """,
                            schemas,
                        )
                    except Exception:
                        cur.execute(
                            f"""
                            SELECT env_schema, table_name FROM datatools.table_registry
                            WHERE env_schema IN ({placeholders})
                              AND table_name NOT LIKE 'back_up_%%'
                              AND table_name NOT LIKE 'to_be_deleted_%%'
                            ORDER BY env_schema, table_name
                            """,
                            schemas,
                        )
                    rows = cur.fetchall()
                    for r in rows:
                        created_at = r[2] if len(r) > 2 and r[2] else None
                        out.append({
                            "env_schema": r[0],
                            "table_name": r[1],
                            "type": "table",
                            "status": "Active",
                            "created_at": created_at.isoformat() if created_at and hasattr(created_at, "isoformat") else (str(created_at) if created_at else None),
                        })
                elif filter_type == "backups":
                    for sch in schemas:
                        cur.execute(
                            """
                            SELECT table_schema, table_name FROM information_schema.tables
                            WHERE table_schema = %s AND table_name LIKE 'back_up_%%'
                            ORDER BY table_name
                            """,
                            (sch,),
                        )
                        for r in cur.fetchall():
                            out.append({
                                "env_schema": r[0],
                                "table_name": r[1],
                                "type": "backup",
                                "status": "Backup",
                                "created_at": None,
                            })
                else:
                    placeholders = ",".join("%s" for _ in schemas)
                    cur.execute(
                        f"""
                        SELECT env_schema, renamed_table_name, delete_after
                        FROM datatools.deletion_schedule
                        WHERE env_schema IN ({placeholders})
                        ORDER BY env_schema, renamed_table_name
                        """,
                        schemas,
                    )
                    for r in cur.fetchall():
                        out.append({
                            "env_schema": r[0],
                            "table_name": r[1],
                            "type": "to_be_deleted",
                            "status": "Pending",
                            "delete_after": r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2]),
                            "created_at": None,
                        })
            if search:
                out = [t for t in out if search in (t["table_name"] or "").lower() or search in (t["env_schema"] or "").lower()]
            # Fetch owners from pg_tables (must be inside get_conn block while connection is open)
            if out:
                pairs = [(t["env_schema"], t["table_name"]) for t in out]
                with conn.cursor() as cur2:
                    placeholders = ",".join("(%s,%s)" for _ in pairs)
                    flat = [x for p in pairs for x in p]
                    cur2.execute(
                        f"SELECT schemaname, tablename, tableowner FROM pg_tables WHERE (schemaname, tablename) IN ({placeholders})",
                        flat,
                    )
                    owner_map = {(r[0], r[1]): r[2] for r in cur2.fetchall()}
                for t in out:
                    t["owner"] = owner_map.get((t["env_schema"], t["table_name"]))
            return {"tables": out}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list tables: {e!s}") from e


@app.get("/assets/table-columns")
def assets_table_columns(
    env_schema: str = Query(..., description="Schema (dev/prod)"),
    table_name: str = Query(..., description="Table name"),
):
    """Return column names for a table (from information_schema) for generating SELECT."""
    validate_env_schema(env_schema)
    validate_table_name(table_name)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (env_schema, table_name),
                )
                rows = cur.fetchall()
        columns = [r[0] for r in rows]
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table {env_schema}.{table_name} not found or has no columns")
        return {"columns": columns}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get columns: {e!s}") from e


def _format_size(n: int) -> str:
    """Format bytes as human-readable size."""
    if n is None or n < 0:
        return "—"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024
    return f"{n:.1f} PB"


@app.get("/assets/table-details")
def assets_table_details(
    env_schema: str = Query(..., description="Schema (dev/prod)"),
    table_name: str = Query(..., description="Table name"),
):
    """Return table stats: row count, size, owner, environment, sample rows."""
    validate_env_schema(env_schema)
    validate_table_name(table_name)
    qualified = f'"{env_schema}"."{table_name}"'
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {qualified}")
                row_count = cur.fetchone()[0]
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT pg_total_relation_size(%s::regclass)",
                    (qualified,),
                )
                size_bytes = cur.fetchone()[0] or 0
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT tableowner FROM pg_tables WHERE schemaname = %s AND tablename = %s",
                    (env_schema, table_name),
                )
                row = cur.fetchone()
                owner = row[0] if row else None
            with conn.cursor() as cur:
                cur.execute(f"SELECT * FROM {qualified} LIMIT 10")
                columns = [d[0] for d in cur.description] if cur.description else []
                sample_rows = [list(r) for r in cur.fetchall()]
        return {
            "env_schema": env_schema,
            "table_name": table_name,
            "row_count": row_count,
            "size_bytes": size_bytes,
            "size_human": _format_size(size_bytes),
            "owner": owner,
            "sample_columns": columns,
            "sample_rows": sample_rows,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get table details: {e!s}") from e


@app.get("/assets/table-ddl")
def assets_table_ddl(
    env_schema: str = Query(..., description="Schema (dev/prod)"),
    table_name: str = Query(..., description="Table name"),
):
    """Return CREATE TABLE DDL for the table (from table_registry if available, else built from information_schema). Usable in Create table flow."""
    validate_env_schema(env_schema)
    validate_table_name(table_name)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT ddl FROM datatools.table_registry WHERE env_schema = %s AND table_name = %s",
                    (env_schema, table_name),
                )
                row = cur.fetchone()
            if row and row[0]:
                return {"ddl": row[0]}
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (env_schema, table_name),
                )
                cols = cur.fetchall()
        if not cols:
            raise HTTPException(status_code=404, detail=f"Table {env_schema}.{table_name} not found")
        parts = [f'CREATE TABLE "{env_schema}"."{table_name}" (']
        segs = []
        for (cname, dtype, nullable, default) in cols:
            s = f'  "{cname}" {dtype or "TEXT"}'
            if nullable == "NO":
                s += " NOT NULL"
            if default:
                s += " DEFAULT " + str(default)
            segs.append(s)
        parts.append(",\n".join(segs))
        parts.append(")")
        return {"ddl": "\n".join(parts)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get DDL: {e!s}") from e


@app.post("/assets/schedule-delete")
def assets_schedule_delete(req: ScheduleDeleteRequest):
    """Clone table to back_up_<name>_<YYYYMMDD>, then rename to to_be_deleted_<name>, schedule delete in 7 days, remove from table_registry."""
    validate_env_schema(req.env_schema)
    validate_table_name(req.table_name)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    backup_name = f"back_up_{req.table_name}_{date_str}"
    renamed = f"to_be_deleted_{req.table_name}"
    delete_after = datetime.now(timezone.utc) + timedelta(days=7)
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f'CREATE TABLE "{req.env_schema}"."{backup_name}" AS SELECT * FROM "{req.env_schema}"."{req.table_name}"',
                )
            with conn.cursor() as cur:
                cur.execute(
                    f'ALTER TABLE "{req.env_schema}"."{req.table_name}" RENAME TO "{renamed}"',
                )
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO datatools.deletion_schedule (env_schema, original_table_name, renamed_table_name, delete_after)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (req.env_schema, req.table_name, renamed, delete_after),
                )
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM datatools.table_registry WHERE env_schema = %s AND table_name = %s",
                    (req.env_schema, req.table_name),
                )
            audit_log(conn, "schedule_delete", req.env_schema, {
                "env_schema": req.env_schema,
                "table_name": req.table_name,
                "backup_name": backup_name,
                "renamed_to": renamed,
                "delete_after": delete_after.isoformat(),
            })
        return {
            "status": "ok",
            "backup_name": backup_name,
            "renamed_to": renamed,
            "delete_after": delete_after.isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to schedule delete: {e!s}") from e


@app.post("/assets/restore-backup")
def assets_restore_backup(req: RestoreBackupRequest):
    """Rename backup table back to original name; drop to_be_deleted_<name> if present; remove from deletion_schedule; add to table_registry."""
    validate_env_schema(req.env_schema)
    # backup name is back_up_{original}_{YYYYMMDD}
    m = re.match(r"^back_up_(.+)_\d{8}$", req.table_name)
    if not m:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid backup table name: {req.table_name}. Expected back_up_<name>_YYYYMMDD",
        )
    original_name = m.group(1)
    to_be_deleted_name = f"to_be_deleted_{original_name}"
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f'DROP TABLE IF EXISTS "{req.env_schema}"."{to_be_deleted_name}"',
                )
            with conn.cursor() as cur:
                cur.execute(
                    f'ALTER TABLE "{req.env_schema}"."{req.table_name}" RENAME TO "{original_name}"',
                )
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM datatools.deletion_schedule WHERE env_schema = %s AND renamed_table_name = %s",
                    (req.env_schema, to_be_deleted_name),
                )
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO datatools.table_registry (env_schema, table_name, ddl, parsed_json)
                    VALUES (%s, %s, %s, %s::jsonb)
                    ON CONFLICT (env_schema, table_name) DO UPDATE SET ddl = EXCLUDED.ddl, parsed_json = EXCLUDED.parsed_json
                    """,
                    (req.env_schema, original_name, "", "{}"),
                )
            audit_log(conn, "restore_backup", req.env_schema, {
                "env_schema": req.env_schema,
                "backup_table": req.table_name,
                "restored_as": original_name,
            })
        return {"status": "ok", "restored_as": original_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restore backup: {e!s}") from e


# ---------- Frontend (static) ----------

STATIC_DIR = Path(__file__).resolve().parent / "static"


@app.post("/query/run")
def query_run(req: RunQueryRequest):
    """Execute a single read-only SELECT query. Max 500 rows. Only SELECT is allowed."""
    sql = (req.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL is empty")
    # Remove single-line and block comments for validation
    sql_no_comments = re.sub(r"--[^\n]*", "", sql)
    sql_no_comments = re.sub(r"/\*.*?\*/", "", sql_no_comments, flags=re.DOTALL)
    sql_no_comments = sql_no_comments.strip().upper()
    if not sql_no_comments.startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
    if ";" in sql_no_comments.rstrip(";"):
        idx = sql_no_comments.find(";")
        if idx >= 0 and sql_no_comments[idx + 1 :].strip():
            raise HTTPException(status_code=400, detail="Only a single statement is allowed")
    # Append LIMIT if not present to cap results
    if "LIMIT" not in sql_no_comments:
        sql = sql.rstrip().rstrip(";") + " LIMIT 500"
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                columns = [d[0] for d in cur.description] if cur.description else []
                rows = cur.fetchall()
        return {"columns": columns, "rows": [list(r) for r in rows]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Query failed: {e!s}") from e


@app.get("/")
def index():
    """Serve the DataTools Portfolio UI."""
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Frontend not found")
    return FileResponse(index_path)
