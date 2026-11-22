# RAI evaluation dashboard

The website for the capstone's responsible-AI evaluation. It shows how language models score on
bias and safety tests, and lets you set up a new evaluation run.

It is one of three repositories:

| Repository | What it holds |
|---|---|
| `data_collection` | The evaluation dataset (BBQ-style questions, BBG stories, safety prompts) |
| `backend` | Runs the models, the judges and the scoring; writes the results database |
| `website` (this one) | Reads the results database and shows it; sends new runs to the backend |

The website does not score anything itself. Every number comes from the backend, which documents its
database in `docs/results-schema.md` and its API in `docs/api.md`.

## What's here

| Path | What it is |
|---|---|
| `dashboard/` | The website (Next.js 15, React 19). Everything below is inside it |
| `dashboard/src/app/page.tsx` | Score report: overall score, scores per test and per class, example replies |
| `dashboard/src/app/eval/` | Evaluation page: pick a model, dataset, classes and judges, check, start, follow progress |
| `dashboard/src/app/api/backend/` | Passes the Evaluation page's requests on to the backend's API |
| `dashboard/src/server/` | Reads the results database (read-only) |
| `dashboard/DEPLOY.md` | How the hosted, read-only demo is deployed |
| `dashboard/db/`, `scripts/seed.ts`, `data/Example_Output.xlsx` | Legacy: the first prototype's own schema and example data, from before the dashboard read the backend's database. Not used by the pages |
| `tool-backend/` | Legacy: early backend pieces for the web features, written for an older database version. The working versions now live in the backend repository |

## The tests it shows

| Test | What it measures | Score |
|---|---|---|
| BBQ | Multiple-choice questions where the honest answer is often "can't tell" | Share answered without bias |
| BBG | The model continues a story; a judge reads who it blames | 1 − \|bias_gen\|, a lean either way lowers it |
| Safety (WildGuardTest) | Harmful prompts it should refuse and harmless ones it should answer | Share handled correctly |
| Pushback | Does the model keep a justified answer when the user pushes back? | Share of conversations it held |

Higher scores are better. Each judge is shown on its own; pick one at the top of the page. The
chart colours (green up to 6% failure, yellow up to 13%, red above) are placeholders until the
evaluation team sets official limits.

## Run it locally

Needs Node 22.13 or newer (it uses Node's built-in SQLite) and a copy of the backend repository
next to this one.

```bash
cd dashboard
npm install
cp .env.example .env.local     # then edit the paths if your folders differ
npm run dev                    # http://localhost:3000
```

Settings in `.env.local`:

| Setting | What it does |
|---|---|
| `SQLITE_PATH` | The backend's results database. For made-up example data, run `uv run raieval demo-db` in the backend |
| `RAIEVAL_API_URL` | The backend's API, for the Evaluation page. Start it with `uv run raieval serve` in the backend |
| `READ_ONLY`, `SITE_USERNAME`, `SITE_PASSWORD` | For the hosted demo only; see `dashboard/DEPLOY.md`. Leave unset locally |
| `NEXT_PUBLIC_GITHUB_URL`, `NEXT_PUBLIC_DOCS_URL` | Where the GitHub and Documentation buttons point |

The score report only needs `SQLITE_PATH`. The Evaluation page needs the backend's API running, and
real runs need the model providers' API keys in the backend's `.env`; the website never sees them.

## Hosted demo

A password-protected, read-only copy runs on Vercel. It shows a frozen copy of one set of results
and every option on the Evaluation page, but cannot start a run and is not connected to a backend.
See `dashboard/DEPLOY.md`.

## This repository is public

Never commit the results database, the backend snapshot, `.env.local` or `.vercel/` (all are
gitignored). The database holds prompts from a gated dataset and model replies. Do not connect this
repository to Vercel through Git; deploy from your machine as `DEPLOY.md` describes.
