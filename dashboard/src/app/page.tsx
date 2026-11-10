import { Dashboard } from "@/components/Dashboard";
import { summariesFromTables } from "@/lib/score";
import { databaseExists, getDerivedReplies, getRun, getScoreByClass, getScoreSummary, listRuns } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  if (!databaseExists()) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <section className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-ink">Responsible AI benchmark</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            No evaluation database was found. Run <code className="rounded bg-[#e8f1fa] px-1.5 py-0.5">npm run seed</code> to
            load the scoring output, then refresh this page.
          </p>
        </section>
      </main>
    );
  }

  const params = await searchParams;
  const runs = listRuns();
  const requested = params.run ? Number(params.run) : NaN;
  const run = (Number.isInteger(requested) ? getRun(requested) : null) ?? runs[0] ?? null;

  if (!run) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24">
        <section className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-ink">Responsible AI benchmark</h1>
          <p className="mt-3 text-sm text-muted">The database has no evaluation runs yet.</p>
        </section>
      </main>
    );
  }

  const summaries = summariesFromTables(getScoreSummary(run.id), getScoreByClass(run.id));
  const replies = getDerivedReplies(run.id);
  const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com";
  const docsUrl = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.github.com";

  return (
    <main>
      <Dashboard
        run={run}
        runs={runs}
        summaries={summaries}
        replies={replies}
        githubUrl={githubUrl}
        docsUrl={docsUrl}
      />
    </main>
  );
}
