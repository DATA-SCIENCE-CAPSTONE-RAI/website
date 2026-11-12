import { Dashboard } from "@/components/Dashboard";
import { summariesFromTables } from "@/lib/score";
import {
  databaseExists,
  getAgreement,
  getBiasGen,
  getReplies,
  getScoreByClass,
  getScoreSummary,
  listViews,
  schemaProblem,
  sqlitePath,
} from "@/server/db";

export const dynamic = "force-dynamic";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <section className="rounded-2xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink">Responsible AI benchmark</h1>
        <div className="mt-3 text-sm leading-6 text-muted">{children}</div>
      </section>
    </main>
  );
}

const code = "rounded bg-[#e8f1fa] px-1.5 py-0.5";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ release?: string; judge?: string }>;
}) {
  if (!databaseExists()) {
    return (
      <Notice>
        <p>
          No results database at <code className={code}>{sqlitePath()}</code>.
        </p>
        <p className="mt-2">
          Set <code className={code}>SQLITE_PATH</code> in <code className={code}>.env.local</code> to the backend&apos;s{" "}
          <code className={code}>runs/results.sqlite</code>, or to <code className={code}>runs/demo.sqlite</code> after
          running <code className={code}>uv run raieval demo-db</code> in the backend (mock data, no keys).
        </p>
      </Notice>
    );
  }
  const problem = schemaProblem();
  if (problem) {
    return (
      <Notice>
        <p>{problem}</p>
      </Notice>
    );
  }

  const params = await searchParams;
  const views = listViews();
  const view =
    views.find((item) => item.release === params.release && item.judge === params.judge) ??
    views.find((item) => item.release === params.release) ??
    views[0] ??
    null;

  if (!view) {
    return (
      <Notice>
        <p>
          The database has no scores yet. Run <code className={code}>uv run raieval score</code> in the backend.
        </p>
      </Notice>
    );
  }

  const summaries = summariesFromTables(getScoreSummary(view), getScoreByClass(view), getBiasGen(view));
  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com";
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.github.com";

  return (
    <main>
      <Dashboard
        view={view}
        views={views}
        summaries={summaries}
        replies={getReplies(view)}
        agreement={getAgreement(view)}
        githubUrl={githubUrl}
        docsUrl={docsUrl}
      />
    </main>
  );
}
