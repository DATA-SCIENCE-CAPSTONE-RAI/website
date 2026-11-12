# Hosted read-only demo (Vercel)

The dashboard can run on its own as a results viewer: no evaluation backend, no API keys, no cost
per visit. It ships with a copy of the backend's results database and of its option lists (models,
judges, classes, sizes), so visitors can read the scores and explore every option on the Evaluation
page, but cannot check, estimate or start a run. Every visitor is asked for a password.

| Setting | Effect |
|---|---|
| `READ_ONLY=1` | The Evaluation page shows every option from the saved lists; checking and running are turned off. The `/api/backend` proxy answers only those lists and refuses everything else; it never contacts a backend. |
| `SITE_PASSWORD` | Every page asks for this password (any user name). Unset = no password. |

**Never commit the database or the snapshot** (`data/results.sqlite`, `data/backend-snapshot.json`;
both gitignored). The database holds prompts from gated datasets (WildGuardTest) and model
replies, and this repo is public. For the same reason, do not connect
this repo to Vercel through Git: deploy from your machine with `--prebuilt`, which uploads only the
build output. The password is needed for the same reason: the example replies show those prompts.

## Deploy

Needs Node 22.13 or later (`node --version`) and a Vercel account.

```sh
cd dashboard
npm install
cp ../../backend/runs/results.sqlite data/results.sqlite   # the results to show
npm run snapshot          # the Evaluation page's option lists; needs `uv run raieval serve` running

npx vercel login
npx vercel link                       # first time: create the project
npx vercel env add READ_ONLY production        # value: 1
npx vercel env add SITE_PASSWORD production    # value: the password you give out

npx vercel pull --yes --environment=production
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

To show new results, or after changing the password: copy the database again (and `npm run snapshot`
if models, judges or classes changed), then repeat the last three commands.

## Check it locally first

```sh
npm run build
READ_ONLY=1 SITE_PASSWORD=test npm start      # http://localhost:3000, any user name, password "test"
```
