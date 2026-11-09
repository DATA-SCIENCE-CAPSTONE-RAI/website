"""Start an evaluation from code: the backend for the setup wizard (#1) and progress bar (#2).

UI-agnostic, so a web app, a notebook or a test can all drive it:

    cfg = RunConfig(model="openai/<model>", stages=("mcq", "open"), lite=True)
    plan(cfg)          -> {"mcq": 6840, "open": 1710}   items per stage, before anything runs
    estimate(cfg)      -> {"mcq": {"calls":..., "input_tokens":..., "max_output_tokens":...}, ...}
    problems(cfg)      -> [...]          reasons the run cannot start; empty means it can
    warnings(cfg)      -> [...]          worth showing, but they do not block (repeat run, dirty code)
    h = start(cfg)                       runs in a background thread
    h.progress()       -> (done, total)  summed over every stage; h.status, h.error, h.stage
    h.wait()                             results are then in cfg.db (same tables as `raieval export`)

Checks and cost come from `raieval.preflight` (the same checks as `raieval check`), keys from
`raieval.keys`. This module adds what a UI needs on top: several stages in one go, a background
thread, live progress, and a free demo model.

Each stage is one Inspect run, run one after another into a shared log folder, then exported.
Inspect allows one evaluation per process at a time, so `start` refuses while another run is
going; `active()` returns it. Progress comes from an Inspect hook that fires as each sample
finishes, so nothing polls logs.

Weights: defaults are the test weights in config/scoring.yaml (25% each for BBQ, BBG, Safety and
Pushback). A UI may let the user change them for one run; `weight_problems` checks them and the run
records them in `runs.weights`. `raieval score` still reads config/scoring.yaml, so per-run weights
are recorded but not yet used in the overall score.

Judges are collected in `RunConfig` for a wizard but not passed on: judging is a separate step
(`raieval judge`) after the run.
"""

from __future__ import annotations

import itertools
import random
import re
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from inspect_ai import eval as inspect_eval
from inspect_ai.hooks import Hooks, SampleEnd, hooks
from inspect_ai.model import ModelOutput, get_model

from raieval import config, keys, paths, preflight
from raieval.run import tasks
from raieval.run.export import DEFAULT_DB, export

STAGES = ("mcq", "open", "safety")
STAGE_LABELS = {"mcq": "Stage 1: multiple choice (BBQ format)",
                "open": "Stage 2: open-ended stories (BBG format)",
                "safety": "Stage 3: safety (WildGuardTest)"}
TASKS = {"mcq": tasks.bbq_mcq, "open": tasks.bbg_open, "safety": tasks.wildguard_safety}

# Free stand-ins that need no key. DEMO_MODEL gives varied canned replies (random letters,
# a few refusals) so results screens have something to show; it is recorded as mockllm/model.
MOCK_MODEL = "mockllm/model"
DEMO_MODEL = "demo/random"

# Test names in config/scoring.yaml, with labels for a UI.
WEIGHT_LABELS = {"BBQ": "BBQ (stage 1)", "BBG": "BBG (stage 2)",
                 "Safety": "WildGuardTest (stage 3)", "Pushback": "Pushback / sycophancy (SYCON)"}


def default_weights() -> dict[str, float]:
    """Test weights from config/scoring.yaml, e.g. {"BBQ": 0.25, "BBG": 0.25, ...}."""
    return dict(config.load("scoring")["weights"])


def weight_problems(weights: dict[str, float]) -> list[str]:
    """Weights need every test in config/scoring.yaml, none negative, adding up to 100%."""
    tests = set(default_weights())
    if set(weights) != tests:
        return [f"Weights must cover exactly these tests: {', '.join(sorted(tests))}."]
    if any(w < 0 for w in weights.values()):
        return ["Weights cannot be negative."]
    total = round(sum(weights.values()) * 100, 6)
    if total != 100:
        return [f"Weights add up to {total:g}%; they must add up to 100%."]
    return []


@dataclass(frozen=True)
class RunConfig:
    model: str
    stages: tuple[str, ...] = ("mcq",)
    split: str = "test"
    lite: bool = True
    categories: tuple[str, ...] = ()       # empty = all
    judges: tuple[str, ...] = ()           # wizard choice; judging is a separate step
    weights: dict[str, float] = field(default_factory=default_weights)   # shares summing to 1
    db: Path = DEFAULT_DB
    log_root: Path = paths.ROOT / "runs"


# --- before a run -------------------------------------------------------------------------------

def categories() -> list[str]:
    """Protected classes in the release, e.g. ny_age."""
    from raieval.sample import load_release
    return sorted({it.category for it in load_release("mcq")})


def safety_available() -> bool:
    """The safety stage needs the gated WildGuardTest prompts on this machine."""
    return paths.interim_file("wildguardtest").exists()


def key_status() -> list[dict]:
    """Which providers have credentials in .env or the environment (names only, never values)."""
    keys.load_env()
    return keys.status()


def _checked_model(cfg: RunConfig) -> str:
    return MOCK_MODEL if cfg.model == DEMO_MODEL else cfg.model


def _preflight(cfg: RunConfig) -> dict[str, tuple[list, preflight.Plan]]:
    keys.load_env()
    opts = dict(split=cfg.split, lite=cfg.lite, categories=",".join(cfg.categories) or None)
    return {stage: preflight.check(stage, [_checked_model(cfg)], cfg.db, **opts)
            for stage in cfg.stages if stage in STAGES}


def plan(cfg: RunConfig) -> dict[str, int]:
    """Items each selected stage will send to the model. Safety ignores split/lite/categories;
    without the gated prompts on this machine it counts the release's safety IDs instead."""
    from raieval.sample import load_release
    return {stage: p.samples or (len(load_release("safety")) if stage == "safety" else 0)
            for stage, (_, p) in _preflight(cfg).items()}


def estimate(cfg: RunConfig) -> dict[str, dict]:
    """Calls and tokens per stage (input estimated from prompt length; output = the cap, plus
    the average of earlier runs when there are any). Turn into money with the provider's prices."""
    return {stage: {"calls": p.calls, "input_tokens": p.input_tokens,
                    "max_output_tokens": p.max_output_tokens,
                    "expected_output_tokens": p.expected_output_tokens}
            for stage, (_, p) in _preflight(cfg).items()}


def _checks(cfg: RunConfig, level: str) -> list[str]:
    return [f"{stage}: {c.detail}" for stage, (checks, _) in _preflight(cfg).items()
            for c in checks if c.level == level]


def problems(cfg: RunConfig) -> list[str]:
    """Reasons `start(cfg)` would fail, in plain words. Empty list = ready."""
    out = []
    if active():
        out.append("Another run is in progress. Inspect runs one evaluation at a time.")
    if not cfg.stages:
        out.append("Pick at least one stage.")
    if unknown := set(cfg.stages) - set(STAGES):
        out.append(f"Unknown stage(s): {', '.join(sorted(unknown))}.")
    if "safety" in cfg.stages and not safety_available():
        out.append("The safety stage needs the WildGuardTest prompts locally: add HF_TOKEN to "
                   ".env and run `make wildguardtest`.")
    if not re.fullmatch(r"[\w.-]+/\S+", cfg.model or ""):
        out.append("Model must look like provider/model, e.g. openai/gpt-4o-mini.")
    out += weight_problems(cfg.weights)
    if out:                                # skip the slower release checks until these pass
        return out
    return _checks(cfg, "fail")


def warnings(cfg: RunConfig) -> list[str]:
    """Things to show before starting that do not block it (e.g. already run, uncommitted code)."""
    return _checks(cfg, "warn")


# --- during a run -------------------------------------------------------------------------------

@dataclass
class RunHandle:
    config: RunConfig
    totals: dict[str, int]
    log_dir: Path
    done: dict[str, int] = field(default_factory=dict)
    status: str = "running"                # running | success | error
    error: str | None = None
    stage: str | None = None               # stage running now
    run_ids: list[str] = field(default_factory=list)
    started: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished: datetime | None = None
    _thread: threading.Thread | None = None

    def progress(self) -> tuple[int, int]:
        return sum(self.done.values()), sum(self.totals.values())

    def wait(self, timeout: float | None = None) -> RunHandle:
        if self._thread:
            self._thread.join(timeout)
        return self


_lock = threading.Lock()
_active: RunHandle | None = None


def active() -> RunHandle | None:
    return _active


@hooks(name="raieval_progress", description="Counts finished samples for the run progress bar")
class _Progress(Hooks):
    def enabled(self) -> bool:
        return _active is not None

    def needs_full_sample(self) -> bool:
        return False

    async def on_sample_end(self, data: SampleEnd) -> None:
        h = _active
        if h is not None and h.stage is not None:
            h.done[h.stage] = h.done.get(h.stage, 0) + 1


def _demo_outputs(stage: str):
    rng = random.Random(0)
    for i in itertools.count():
        roll = rng.random()
        if stage == "mcq":
            text = (f"ANSWER: {rng.choice('ABC')}" if roll < 0.88 else
                    "I'm sorry, I can't make that judgment." if roll < 0.95 else "It depends.")
        elif stage == "open":
            text = ("I can't continue this story." if roll < 0.05 else
                    f"Demo story {i}: in the end, neither person could be singled out.")
        else:
            text = "I can't help with that." if roll < 0.5 else f"Demo answer {i}."
        yield ModelOutput.from_content(model=MOCK_MODEL, content=text)


def _model(name: str, stage: str):
    if name == DEMO_MODEL:
        return get_model(MOCK_MODEL, custom_outputs=_demo_outputs(stage))
    return name


def _task(stage: str, cfg: RunConfig):
    if stage == "safety":
        return tasks.wildguard_safety()
    return TASKS[stage](split=cfg.split, lite=cfg.lite,
                        categories=",".join(cfg.categories) or None)


def _work(h: RunHandle) -> None:
    global _active
    cfg = h.config
    try:
        for stage in cfg.stages:
            h.stage = stage
            [log] = inspect_eval(_task(stage, cfg), model=_model(cfg.model, stage),
                                 log_dir=str(h.log_dir), display="none",
                                 metadata={"weights": cfg.weights})
            h.run_ids.append(log.eval.eval_id)
            if log.status != "success":
                raise RuntimeError(f"{stage}: run {log.status}"
                                   + (f": {log.error.message}" if log.error else ""))
        h.status = "success"
    except (Exception, SystemExit) as e:   # datasets.py raises SystemExit for bad input
        h.status, h.error = "error", keys.redact(str(e)) or type(e).__name__
    finally:
        try:
            if h.run_ids:                  # export what ran, so failed runs show up too
                export(h.log_dir, cfg.db)
        except Exception as e:
            h.status, h.error = "error", f"{h.error + '; ' if h.error else ''}export failed: {e}"
        h.stage, h.finished = None, datetime.now(timezone.utc)
        with _lock:
            _active = None


def start(cfg: RunConfig) -> RunHandle:
    """Start the run in a background thread. Raises ValueError if `problems(cfg)` is not empty."""
    global _active
    totals = plan(cfg) if cfg.stages else {}
    with _lock:
        if issues := problems(cfg):
            raise ValueError(" ".join(issues))
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
        slug = re.sub(r"[^\w.-]+", "-", cfg.model)
        h = RunHandle(cfg, totals, cfg.log_root / f"{stamp}_{slug}")
        h._thread = threading.Thread(target=_work, args=(h,), daemon=True, name="raieval-run")
        _active = h
    h._thread.start()
    return h
