import { loginAndStoreSession } from "@/lib/foundation-auth";
import {
  clearMonitorSession,
  getMonitorSessionPublic,
} from "@/lib/store";

export const runtime = "nodejs";

function dashboardAuthorized(req: Request): boolean {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return true;
  if (req.headers.get("x-dashboard-password") === password) return true;
  if (req.headers.get("authorization") === `Bearer ${password}`) return true;
  return false;
}

export async function GET(req: Request) {
  if (!dashboardAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const session = await getMonitorSessionPublic();
    return Response.json({ session });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!dashboardAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    if (!body.email?.trim() || !body.password) {
      return Response.json(
        { error: "email and password required" },
        { status: 400 },
      );
    }
    const session = await loginAndStoreSession(body.email, body.password);
    return Response.json({ session });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  if (!dashboardAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await clearMonitorSession();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
