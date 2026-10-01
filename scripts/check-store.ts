/**
 * ponytail: one-shot store smoke — fails if Neon schema/read/write breaks.
 * Run: node --env-file=.env.local --import tsx scripts/check-store.ts
 */
import { getLatestRun, saveRun } from "../src/lib/store";

async function main() {
  const run = await saveRun({
    summary: {
      apiOk: 1,
      apiFail: 0,
      pageOk: 0,
      pageFail: 0,
      securityOk: 1,
      securityFail: 0,
    },
    apiResults: [
      {
        id: "smoke",
        name: "Smoke",
        method: "GET",
        path: "/api/v1/health",
        statusCode: 200,
        ok: true,
        latencyMs: 1,
        error: null,
        checkedAt: new Date().toISOString(),
      },
    ],
    pageResults: [],
    securityResults: [],
  });

  const latest = await getLatestRun();
  if (!latest || latest.id !== run.id) {
    throw new Error(`expected latest id ${run.id}, got ${latest?.id}`);
  }
  console.log("store ok", { id: latest.id, checkedAt: latest.checkedAt });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
