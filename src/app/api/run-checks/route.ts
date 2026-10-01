import { checkApis } from "@/lib/check-apis";
import { checkPages, summarizePageResults } from "@/lib/check-pages";
import {
  checkSecurity,
  summarizeSecurityResults,
} from "@/lib/check-security";
import { getMonitorSession, saveRun } from "@/lib/store";
import type { CheckRunSummary } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);

  if (secret) {
    if (auth === `Bearer ${secret}`) return true;
    if (url.searchParams.get("secret") === secret) return true;
    const cronHeader = req.headers.get("x-vercel-cron-secret");
    if (cronHeader && cronHeader === secret) return true;
  }

  if (dashboardPassword) {
    if (req.headers.get("x-dashboard-password") === dashboardPassword) return true;
    if (auth === `Bearer ${dashboardPassword}`) return true;
  }

  return false;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await getMonitorSession();
  if (!session && !process.env.FOUNDATION_MONITOR_TOKEN?.trim()) {
    return Response.json(
      {
        error:
          "Foundation login required. Sign in on the dashboard before running checks.",
      },
      { status: 403 },
    );
  }

  try {
    const apiResults = await checkApis();
    const pageResults = await checkPages();
    const securityResults = await checkSecurity();

    const apiOk = apiResults.filter((r) => r.ok).length;
    const apiFail = apiResults.length - apiOk;
    const { pageOk, pageFail } = summarizePageResults(pageResults);
    const { securityOk, securityFail } =
      summarizeSecurityResults(securityResults);

    const summary: CheckRunSummary = {
      apiOk,
      apiFail,
      pageOk,
      pageFail,
      securityOk,
      securityFail,
    };
    const run = await saveRun({
      summary,
      apiResults,
      pageResults,
      securityResults,
    });

    return Response.json({
      ok: apiFail === 0 && pageFail === 0 && securityFail === 0,
      summary,
      checkedAt: run.checkedAt,
      id: run.id,
    });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
