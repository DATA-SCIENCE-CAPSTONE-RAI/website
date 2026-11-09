"""Run backend for the setup wizard and progress bar, on the free mock models."""

import json
import sqlite3
import time

import pytest

pytest.importorskip("inspect_ai")
from raieval import config, keys, paths  # noqa: E402
from raieval.run import runner  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def needs_release():
    if not (paths.release_dir(config.load("sampling")["release"]) / "manifest.csv").exists():
        pytest.skip("run `raieval sample` first")


@pytest.fixture
def no_keys(monkeypatch):
    """Ignore any real .env on this machine: no provider has credentials."""
    monkeypatch.setattr(keys, "load_env", lambda *a, **k: None)
    for p in keys.PROVIDERS:
        for alt in p.any_of:
            for var in alt:
                monkeypatch.delenv(var, raising=False)


def test_plan_counts_match_lite_subset():
    cfg = runner.RunConfig(model=runner.MOCK_MODEL, stages=("mcq", "open"), categories=("ny_age",))
    assert runner.plan(cfg) == {"mcq": 45 * 8, "open": 45 * 2}    # 45 test templates, 1 pair
    assert runner.plan(runner.RunConfig(model="x/y", stages=("safety",))) == {"safety": 1699}


def test_categories_are_the_ny_classes():
    cats = runner.categories()
    assert len(cats) == 19 and all(c.startswith("ny_") for c in cats)


def test_problems_in_plain_words(no_keys):
    ok = runner.RunConfig(model=runner.MOCK_MODEL, categories=("ny_age",))
    assert runner.problems(ok) == []
    assert runner.problems(runner.RunConfig(model=runner.DEMO_MODEL)) == []
    bad = runner.RunConfig(model="gpt-4o", stages=())
    msgs = " ".join(runner.problems(bad))
    assert "at least one stage" in msgs and "provider/model" in msgs
    no_key = runner.problems(runner.RunConfig(model="openai/gpt-4o-mini", categories=("ny_age",)))
    assert any("no credentials for openai/gpt-4o-mini" in p for p in no_key)   # from preflight
    unknown = runner.problems(runner.RunConfig(model=runner.MOCK_MODEL, categories=("ny_nope",)))
    assert any("ny_nope" in p for p in unknown)


def test_key_status_names_only(monkeypatch, no_keys):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real-0000000000")
    status = {r["label"]: r for r in runner.key_status()}
    assert status["OpenAI"]["ready"] and not status["Anthropic"]["ready"]
    assert "sk-test-not-real" not in repr(status)


def test_estimate_counts_calls_and_tokens():
    est = runner.estimate(runner.RunConfig(model=runner.MOCK_MODEL, categories=("ny_age",)))
    assert est["mcq"]["calls"] == 360 and est["mcq"]["input_tokens"] > 0
    assert est["mcq"]["max_output_tokens"] >= est["mcq"]["calls"]


def test_safety_needs_local_prompts(monkeypatch):
    monkeypatch.setattr(runner, "safety_available", lambda: False)
    cfg = runner.RunConfig(model=runner.MOCK_MODEL, stages=("safety",))
    assert any("make wildguardtest" in p for p in runner.problems(cfg))
    with pytest.raises(ValueError, match="make wildguardtest"):
        runner.start(cfg)


def test_run_reports_progress_and_exports(tmp_path):
    cfg = runner.RunConfig(model=runner.DEMO_MODEL, stages=("mcq", "open"),
                           categories=("ny_age",), db=tmp_path / "r.sqlite", log_root=tmp_path)
    h = runner.start(cfg)
    assert h.progress()[1] == 450
    if h.status == "running":                     # one evaluation at a time
        assert runner.active() is h
        assert any("in progress" in p for p in runner.problems(cfg))
    seen = []
    while h.status == "running":
        seen.append(h.progress()[0])
        time.sleep(0.01)
    h.wait()
    assert h.status == "success", h.error
    assert seen == sorted(seen)                    # never goes backwards
    assert h.progress() == (450, 450) and h.done == {"mcq": 360, "open": 90}
    assert runner.active() is None and len(h.run_ids) == 2
    with sqlite3.connect(cfg.db) as con:
        assert con.execute("SELECT COUNT(*) FROM responses").fetchone()[0] == 450
        statuses = dict(con.execute("SELECT status, COUNT(*) FROM responses WHERE stage = 'mcq' "
                                    "GROUP BY 1").fetchall())
    assert statuses["ok"] > 300 and statuses.get("refused", 0) > 0   # demo replies vary


def test_failed_run_reports_error(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("provider unreachable")
    monkeypatch.setattr(runner, "inspect_eval", boom)
    cfg = runner.RunConfig(model=runner.MOCK_MODEL, categories=("ny_age",),
                           db=tmp_path / "r.sqlite", log_root=tmp_path)
    h = runner.start(cfg).wait()
    assert h.status == "error" and "provider unreachable" in h.error
    assert runner.active() is None and h.finished is not None


def test_default_weights_are_equal_and_checked():
    w = runner.default_weights()
    assert w == {"BBQ": 0.25, "BBG": 0.25, "Safety": 0.25, "Pushback": 0.25}
    assert runner.weight_problems(w) == []
    assert runner.weight_problems({**w, "BBQ": 0.5})[0].startswith("Weights add up to 125%")
    assert "negative" in runner.weight_problems({**w, "BBQ": -0.25, "BBG": 0.75})[0]
    assert "exactly these tests" in runner.weight_problems({"BBQ": 1.0})[0]
    assert runner.weight_problems({"BBQ": 0.33, "BBG": 0.33, "Safety": 0.34,
                                   "Pushback": 0.0}) == []            # float sums are fine
    cfg = runner.RunConfig(model=runner.MOCK_MODEL, categories=("ny_age",),
                           weights={**w, "BBQ": 0.5})
    assert any("100%" in p for p in runner.problems(cfg))


def test_run_records_chosen_weights(tmp_path):
    weights = {"BBQ": 0.4, "BBG": 0.3, "Safety": 0.2, "Pushback": 0.1}
    cfg = runner.RunConfig(model=runner.DEMO_MODEL, categories=("ny_age",), weights=weights,
                           db=tmp_path / "r.sqlite", log_root=tmp_path)
    h = runner.start(cfg).wait()
    assert h.status == "success", h.error
    with sqlite3.connect(cfg.db) as con:
        [(stored,)] = con.execute("SELECT weights FROM runs").fetchall()
    assert json.loads(stored) == weights
