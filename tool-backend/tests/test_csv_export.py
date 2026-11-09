"""`raieval export-csv`: results SQLite -> one CSV row per response."""

import csv
import sqlite3

import pytest

pytest.importorskip("inspect_ai")
from raieval import cli  # noqa: E402
from raieval.run import csv_export, export  # noqa: E402

JUDGE_A, JUDGE_B = "anthropic/judge", "openai/judge"


def _insert(con, table, **row):
    con.execute(f"INSERT INTO {table} ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",
                list(row.values()))


@pytest.fixture
def db(tmp_path):
    """Three runs (mcq, open, safety); two judges on the open run, one on safety."""
    path = tmp_path / "results.sqlite"
    with sqlite3.connect(path) as con:
        export.ensure_schema(con)
        for i, (run_id, stage) in enumerate([("r-mcq", "mcq"), ("r-open", "open"),
                                             ("r-safe", "safety")]):
            _insert(con, "runs", run_id=run_id, task=f"task_{stage}", stage=stage,
                    model="mockllm/model", created=f"2026-11-0{i + 1}T00:00:00", status="success",
                    release="v1.0", prompt_version=f"{stage}_v1", git_sha="abc123",
                    task_args='{"lite": true}', log_file="/home/someone/run.eval")
            for n in range(3):
                _insert(con, "responses", run_id=run_id, item_id=f"{stage}-{n}", epoch=1,
                        model="mockllm/model", stage=stage, category="ny_age",
                        prompt=f"{stage} prompt {n}, café", response=f"reply {n}\nline two",
                        status="ok")
        for n, (a, b) in enumerate([("STEREOTYPED", "STEREOTYPED"), ("STEREOTYPED", "UNDETERMINED")]):
            _insert(con, "judgments", run_id="r-open", item_id=f"open-{n}", epoch=1,
                    judge=JUDGE_B, verdict=b, reinforced=int(b == "STEREOTYPED"), validity="OK")
            _insert(con, "judgments", run_id="r-open", item_id=f"open-{n}", epoch=1,
                    judge=JUDGE_A, verdict=a, reinforced=int(a == "STEREOTYPED"), validity="OK")
        _insert(con, "judgments", run_id="r-safe", item_id="safety-0", epoch=1,
                judge="google/judge", verdict="REFUSE", harmful=0, refusal=1,
                validity="OK")
    return path


def _read(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_one_row_per_response_with_run_details(db, tmp_path):
    out = tmp_path / "out.csv"
    assert csv_export.export_csv(db, out) == 9
    rows = _read(out)
    with sqlite3.connect(db) as con:
        assert len(rows) == con.execute("SELECT COUNT(*) FROM responses").fetchone()[0]
        resp_cols = [r[1] for r in con.execute("PRAGMA table_info(responses)")]
    assert all(c in rows[0] for c in resp_cols)                 # every responses column
    assert rows[0]["run_release"] == "v1.0" and rows[0]["run_git_sha"] == "abc123"
    assert rows[0]["run_prompt_version"] == "mcq_v1"
    assert "run_log_file" not in rows[0]                        # local path stays out
    assert [r["run_id"] for r in rows[::3]] == ["r-mcq", "r-open", "r-safe"]   # by created
    assert rows[0]["response"] == "reply 0\nline two"            # newlines survive quoting
    assert rows[3]["prompt"] == "open prompt 0, café"            # non-ASCII survives


def test_judges_are_wide_and_stable(db, tmp_path):
    csv_export.export_csv(db, tmp_path / "x.csv")
    rows = _read(tmp_path / "x.csv")
    judge_cols = [c for c in rows[0] if c.startswith("judge_")]
    assert judge_cols == [f"judge_{n}_{f}" for n in (1, 2, 3)
                          for f in ("name", *csv_export.JUDGE_FIELDS)]
    by_item = {r["item_id"]: r for r in rows}
    # judges sorted by name, so judge_1 is the same model on every row
    assert by_item["open-1"]["judge_1_name"] == JUDGE_A
    assert by_item["open-1"]["judge_1_verdict"] == "STEREOTYPED"
    assert by_item["open-1"]["judge_1_reinforced"] == "1" and by_item["open-1"]["judge_1_validity"] == "OK"
    assert by_item["open-1"]["judge_3_verdict"] == "UNDETERMINED"   # openai/judge sorts last
    assert by_item["open-2"]["judge_1_name"] == ""               # not judged -> blank
    assert by_item["safety-0"]["judge_2_name"] == "google/judge"
    assert by_item["safety-0"]["judge_2_harmful"] == "0"
    assert by_item["safety-0"]["judge_2_refusal"] == "1"
    assert by_item["mcq-0"]["judge_1_verdict"] == ""


def test_safety_prompts_blank_unless_gated(db, tmp_path):
    csv_export.export_csv(db, tmp_path / "a.csv")
    rows = _read(tmp_path / "a.csv")
    assert all(r["prompt"] == "" for r in rows if r["stage"] == "safety")
    assert all(r["response"] for r in rows if r["stage"] == "safety")   # replies are kept
    assert all(r["prompt"] for r in rows if r["stage"] != "safety")
    csv_export.export_csv(db, tmp_path / "b.csv", include_gated=True)
    assert all(r["prompt"] for r in _read(tmp_path / "b.csv"))


def test_filter_by_run(db, tmp_path):
    out = tmp_path / "one.csv"
    assert csv_export.export_csv(db, out, run_ids=["r-open", "r-open"]) == 3
    rows = _read(out)
    assert {r["run_id"] for r in rows} == {"r-open"}
    assert sum(c.endswith("_name") for c in rows[0]) == 2       # only judges in this run
    with pytest.raises(ValueError, match="r-nope"):
        csv_export.export_csv(db, out, run_ids=["r-open", "r-nope"])


def test_no_judgments_means_no_judge_columns(tmp_path):
    db = tmp_path / "empty.sqlite"
    with sqlite3.connect(db) as con:
        export.ensure_schema(con)
    assert csv_export.export_csv(db) == 0
    header = _read_header(db.with_suffix(".csv"))               # default out = db path + .csv
    assert "prompt" in header and not any(c.startswith("judge_") for c in header)


def _read_header(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return next(csv.reader(f))


def test_rejects_missing_or_old_db(tmp_path):
    with pytest.raises(FileNotFoundError):
        csv_export.export_csv(tmp_path / "nope.sqlite")
    old = tmp_path / "old.sqlite"                               # main-branch export: no meta
    with sqlite3.connect(old) as con:
        con.execute("CREATE TABLE responses (run_id TEXT)")
    with pytest.raises(ValueError, match="raieval export"):
        csv_export.export_csv(old)


def test_does_not_write_to_db(db, tmp_path):
    before = db.read_bytes()
    csv_export.export_csv(db, tmp_path / "o.csv")
    assert db.read_bytes() == before


def test_cli(db, tmp_path, capsys):
    out = tmp_path / "cli.csv"
    cli.main(["export-csv", "--db", str(db), "--run", "r-safe", "--out", str(out)])
    assert len(_read(out)) == 3
    assert "3 safety prompts left blank" in capsys.readouterr().out
    cli.main(["export-csv", "--db", str(db), "--run", "r-mcq", "--out", str(out)])
    assert "left blank" not in capsys.readouterr().out
    with pytest.raises(SystemExit) as e:
        cli.main(["export-csv", "--db", str(tmp_path / "missing.sqlite")])
    assert e.value.code == 1
