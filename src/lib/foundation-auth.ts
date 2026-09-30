import {
  getMonitorSession,
  saveMonitorSession,
  type MonitorSessionPublic,
} from "./store";

function apiBase(): string {
  const base = process.env.FOUNDATION_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("FOUNDATION_API_BASE_URL is not set");
  return base;
}

function cookieLines(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function readCookie(headers: Headers, name: string): string | null {
  for (const line of cookieLines(headers)) {
    for (const part of line.split(/,(?=\s*[^;=]+=)/)) {
      const m = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`, "i").exec(
        part.trim(),
      );
      if (m?.[1]) return decodeURIComponent(m[1]);
    }
  }
  return null;
}

export function readTokensFromSetCookie(headers: Headers): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: readCookie(headers, "access_token"),
    refreshToken: readCookie(headers, "refresh_token"),
  };
}

/** Login with email/password — password is NOT stored; only tokens go to DB. */
export async function loginAndStoreSession(
  email: string,
  password: string,
): Promise<MonitorSessionPublic> {
  const res = await fetch(`${apiBase()}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: email.trim(), password }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? `Foundation login failed (HTTP ${res.status})`,
    );
  }

  const { accessToken, refreshToken } = readTokensFromSetCookie(res.headers);
  if (!accessToken || !refreshToken) {
    throw new Error(
      "Login OK but missing access_token/refresh_token cookies",
    );
  }

  return saveMonitorSession({
    email: email.trim(),
    accessToken,
    refreshToken,
  });
}

async function refreshStoredSession(): Promise<string | null> {
  const session = await getMonitorSession();
  if (!session?.refreshToken) return null;

  const res = await fetch(`${apiBase()}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Cookie: `refresh_token=${session.refreshToken}`,
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!res.ok) return null;

  const { accessToken, refreshToken } = readTokensFromSetCookie(res.headers);
  if (!accessToken || !refreshToken) return null;

  await saveMonitorSession({
    email: session.email,
    accessToken,
    refreshToken,
  });
  return accessToken;
}

/**
 * Token for authenticated API checks.
 * 1) optional FOUNDATION_MONITOR_TOKEN env override
 * 2) refresh + use DB session from portal login
 */
export async function resolveMonitorToken(): Promise<string | null> {
  const staticToken = process.env.FOUNDATION_MONITOR_TOKEN?.trim();
  if (staticToken) {
    if (/^Bearer /i.test(staticToken)) return staticToken.slice(7).trim();
    return staticToken;
  }

  const refreshed = await refreshStoredSession();
  if (refreshed) return refreshed;

  const session = await getMonitorSession();
  return session?.accessToken ?? null;
}
