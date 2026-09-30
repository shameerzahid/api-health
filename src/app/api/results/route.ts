import { getLatestRun } from "@/lib/store";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  // If unset, allow (rely on Vercel Deployment Protection). If set, require it.
  if (!password) return true;

  const header = req.headers.get("x-dashboard-password");
  if (header === password) return true;

  const url = new URL(req.url);
  if (url.searchParams.get("password") === password) return true;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${password}`) return true;

  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const run = await getLatestRun();
    if (!run) {
      return Response.json({ run: null });
    }
    return Response.json({ run });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
