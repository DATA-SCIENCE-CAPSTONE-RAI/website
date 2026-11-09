"""Results database -> CSV for analysts: `raieval export-csv [--db] [--run ID ...] [--out]`.

Reads only the SQLite file that `raieval export` writes (docs/results-schema.md), never the
Inspect logs. One CSV row per response, in this column order:

    run_*         run details from `runs` (task, created, status, release, prompt version,
                  git sha, task args, generate config, weights, target kind)
    <responses>   every `responses` column, in table order, so columns added to the
                  schema later show up without changes here
    judge_<n>_*   one group per judge from `judgments`: name, verdict (the stance), the
                  safety flags (harmful, refusal), the story flags (reinforced, challenged),
                  validity, confidence and error.
                  Judge n is the same judge on every row; a blank group means that judge
                  did not score that response. No judgments -> no judge columns.

Safety-stage `prompt` text is left blank unless `include_gated=True`: it comes from
WildGuardTest, whose terms forbid redistribution, and CSVs get shared.
"""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path

from raieval.run.export import DEFAULT_DB, SCHEMA_VERSION

# runs columns copied into every row, prefixed `run_`. model and stage are already in
# responses; samples and log_file are local bookkeeping (log_file is a path on someone's disk);
# runs.judges is unused since judges are per row in `judgments`.
RUN_COLUMNS = ("task", "created", "status", "release", "prompt_version", "git_sha", "task_args",
               "generate_config", "weights", "target_kind")
# `raw`, `evidence` and `notes` are left out: long free text, and in the judge's log.
JUDGE_FIELDS = ("verdict", "harmful", "refusal", "reinforced", "challenged", "validity",
                "confidence", "error")
GATED_STAGES = ("safety",)


def default_out(db: Path) -> Path:
    return db.with_suffix(".csv")


def _check_schema(con: sqlite3.Connection, db: Path) -> None:
    try:
        row = con.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
    except sqlite3.OperationalError:
        row = None
    if not row:
        raise ValueError(f"{db} has no schema_version; run `raieval export <log_dir>` to rebuild it")
    if row[0] != str(SCHEMA_VERSION):
        raise ValueError(f"{db} is schema v{row[0]}, this code reads v{SCHEMA_VERSION}; "
                         "run `raieval export <log_dir>` again")


def _columns(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f"PRAGMA table_info({table})")]


def export_csv(db: Path = DEFAULT_DB, out: Path | None = None, run_ids: list[str] | None = None,
               include_gated: bool = False) -> int:
    """Write responses (all runs, or `run_ids`) to `out`; returns the number of rows written."""
    db, out = Path(db), Path(out) if out else default_out(Path(db))
    if not db.exists():
        raise FileNotFoundError(f"{db} not found; run `raieval export <log_dir>` first")
    run_ids = list(dict.fromkeys(run_ids)) if run_ids else None

    with sqlite3.connect(f"file:{db}?mode=ro", uri=True) as con:   # read-only, per the contract
        _check_schema(con, db)
        where, params = "", []
        if run_ids:
            where = f"WHERE r.run_id IN ({', '.join('?' * len(run_ids))})"
            params = run_ids
            found = {r[0] for r in con.execute(
                f"SELECT run_id FROM runs r {where}", params)}
            missing = [r for r in run_ids if r not in found]
            if missing:
                raise ValueError(f"run(s) not in {db}: {', '.join(missing)}")

        resp_cols = _columns(con, "responses")
        select = ", ".join([f"r.{c} AS run_{c}" for c in RUN_COLUMNS]
                           + [f"x.{c}" for c in resp_cols])
        rows = con.execute(
            f"SELECT {select} FROM responses x JOIN runs r ON r.run_id = x.run_id {where} "
            "ORDER BY r.created, x.run_id, x.rowid", params).fetchall()
        header = [f"run_{c}" for c in RUN_COLUMNS] + resp_cols

        judgments = con.execute(
            f"SELECT j.run_id, j.item_id, j.epoch, j.judge, {', '.join('j.' + f for f in JUDGE_FIELDS)} "
            f"FROM judgments j JOIN runs r ON r.run_id = j.run_id {where}", params).fetchall()

    judges = sorted({j[3] for j in judgments})
    by_response: dict[tuple, dict[str, tuple]] = {}
    for run_id, item_id, epoch, judge, *fields in judgments:
        by_response.setdefault((run_id, item_id, epoch), {})[judge] = tuple(fields)
    for n, _ in enumerate(judges, 1):
        header += [f"judge_{n}_name"] + [f"judge_{n}_{f}" for f in JUDGE_FIELDS]

    i_run, i_item, i_epoch = (header.index(c) for c in ("run_id", "item_id", "epoch"))
    i_stage, i_prompt = header.index("stage"), header.index("prompt")
    blank = (None,) * len(JUDGE_FIELDS)
    n_gated = 0

    out.parent.mkdir(parents=True, exist_ok=True)
    # utf-8-sig: Excel needs the BOM to read non-ASCII names correctly; pandas ignores it.
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in rows:
            row = list(row)
            if not include_gated and row[i_stage] in GATED_STAGES:
                row[i_prompt] = None
                n_gated += 1
            scored = by_response.get((row[i_run], row[i_item], row[i_epoch]), {})
            for judge in judges:
                fields = scored.get(judge)
                row += [judge if fields else None, *(fields or blank)]
            w.writerow(row)

    gated = f" ({n_gated} safety prompts left blank)" if n_gated else ""
    print(f"export-csv: {len(rows)} responses, {len(judges)} judges -> {out}{gated}")
    return len(rows)
