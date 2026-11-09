# Tool backend pieces for the web UI

Backend code for the Phase 1 tool features, ready to wire into the website. These files are
**not a standalone app**: they are modules of the team's evaluation package (`raieval`, in the
private `data_collection` repo) and import it.

**Built against:** `data_collection` branch `feat/connections-judges` at `af403ae`
(results database schema v4, judges, scoring, pre-run checks). All tests pass there
(133 passed, 29 skipped for data that isn't on every machine).

## What's here

| Task | File | What the UI calls |
|---|---|---|
| #1 Step-by-step setup (model → dataset → judges → confirm) | `raieval/run/runner.py` | `categories()`, `safety_available()`, `key_status()`, `plan(cfg)`, `estimate(cfg)`, `problems(cfg)`, `warnings(cfg)`, `start(cfg)` |
| #2 Progress bar | `raieval/run/runner.py` | `active()` or the handle from `start()`: `h.progress()` → `(done, total)`, `h.done` per stage, `h.stage`, `h.status`, `h.error` |
| #4 CSV export | `raieval/run/csv_export.py` | `export_csv(db, out, run_ids, include_gated=False)`; also `raieval export-csv` once `cli_export_csv.patch` is applied |
| #5 Upload reminder | `upload_reminder.md` | Text and checkbox rule; pure UI, no backend |
| #6 Default weights | `raieval/run/runner.py` | `default_weights()`, `weight_problems(weights)` |
| #3 Judge agreement | none here | Already in the backend: `raieval score` writes agreement between each pair of judges to `scores` (`metric = kappa:<judge a>\|<judge b>`), and `judgments` has one row per judge per reply, so the UI can flag replies where judges disagree |

Tests: `tests/test_runner.py`, `tests/test_csv_export.py`.

## How a run works

```python
from raieval.run import runner

cfg = runner.RunConfig(model="openai/<model>", stages=("mcq", "open"), lite=True,
                       categories=("ny_age",), weights=runner.default_weights())
runner.plan(cfg)        # {"mcq": 360, "open": 90}: items per stage
runner.estimate(cfg)    # calls, input tokens, max/expected output tokens per stage
runner.problems(cfg)    # [] when it can start; otherwise plain-English reasons (missing key, ...)
runner.warnings(cfg)    # non-blocking notes (already run, uncommitted code)
h = runner.start(cfg)   # background thread; raises ValueError if problems() isn't empty
h.progress()            # (done, total), updates as each item finishes
```

1. **Checks** reuse `preflight.check()` (the same checks as `raieval check`): the release passes
   validation and matches its git tag, the prompt version exists, items load, the model's
   provider has a key. `runner` adds: one run at a time, stage names, model format, weights.
2. **Each stage is one Inspect run**, run one after another. Inspect allows only one evaluation
   per process, so `start()` refuses while another run is going.
3. **Progress** comes from an Inspect hook that fires as each item finishes. Nothing reads log
   files. Poll `h.progress()` about once a second.
4. **When the run ends** (or fails), results are exported to the results database
   (`runs/results.sqlite`, documented in `docs/results-schema.md`). The UI reads only that file.
5. Judging (`raieval judge`) and scoring (`raieval score`) are separate steps after the run.

**Free demo model:** `model="demo/random"` gives varied canned answers (some refusals, some
unreadable) with no key and no network calls, so every screen can be tested for free. Results
are recorded as `mockllm/model` and mean nothing.

## Weights (#6)

Defaults come from `config/scoring.yaml` in `data_collection`: **BBQ 25%, BBG 25%,
WildGuardTest (Safety) 25%, Pushback / sycophancy (SYCON) 25%**. The setup can let the user
change them per run. `weight_problems()` requires all four, none negative, totalling 100%.

- The chosen weights are saved with the run (`runs.weights`). `raieval score` still reads
  `config/scoring.yaml`, so a per-run choice is recorded but doesn't change the overall score
  yet. That needs a small change in `score.py`.
- Pushback isn't built yet, so its weight has nothing to score. The overall score leaves out
  tests with no results and rescales the rest.
- Stages are always shown separately. The overall score may appear next to them, never instead.
- Thresholds are `caps` in `config/scoring.yaml`, all `null` until the method team sets them.

## CSV export (#4)

One row per response:
- run details, prefixed `run_`
- every `responses` column, so columns added later show up automatically
- one group of columns per judge: `judge_<n>_name`, `verdict`, `harmful`, `refusal`,
  `reinforced`, `challenged`, `validity`, `confidence`, `error`

It opens the database read-only and refuses one from an older schema version. It's written as
UTF-8 with BOM so Excel reads it correctly.

**Safety prompts are left blank** unless `include_gated=True`. They come from WildGuardTest,
whose terms forbid sharing them, and CSVs get shared. Only offer that option for local use.

## Dropping these into `data_collection`

1. Copy `raieval/run/*.py` to `src/raieval/run/`, and `tests/*.py` to `tests/`.
2. Apply the CLI command: `git apply tool-backend/cli_export_csv.patch` from the repo root.
3. Run `uv run pytest tests/test_runner.py tests/test_csv_export.py`.

## Not done

- **No cancel.** Inspect has no clean way to stop a run from outside.
- **Checks take about 5 seconds per stage**, because they validate the release. Cache
  `problems()` and `plan()` for a given setup instead of calling them on every screen refresh.
- **The judge choice in the setup isn't used by the run.** The judge panel lives in
  `config/judges.yaml`, and judging is a separate step.
- **A real safety-stage run hasn't been tested from this code.** It needs the gated prompts locally.
