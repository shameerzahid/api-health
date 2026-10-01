import type { SecurityCheckResult, SecurityFinding } from "./types";

const TIMEOUT_MS = 15_000;

type ProbeTarget = {
  id: string;
  name: string;
  url: string;
};

function requireHttps(urlStr: string): SecurityFinding {
  try {
    const u = new URL(urlStr);
    const ok = u.protocol === "https:";
    return {
      id: "https",
      target: urlStr,
      check: "HTTPS",
      ok,
      detail: ok ? "URL uses https://" : `Expected https, got ${u.protocol}`,
      severity: ok ? "info" : "fail",
    };
  } catch {
    return {
      id: "https",
      target: urlStr,
      check: "HTTPS",
      ok: false,
      detail: "Invalid URL",
      severity: "fail",
    };
  }
}

function headerFindings(
  target: string,
  headers: Headers,
): SecurityFinding[] {
  const get = (name: string) => headers.get(name);

  const hsts = get("strict-transport-security");
  const xcto = get("x-content-type-options");
  const xfo = get("x-frame-options");
  const csp = get("content-security-policy");
  const referrer = get("referrer-policy");
  const permissions = get("permissions-policy") ?? get("feature-policy");

  const frameOk = Boolean(xfo) || Boolean(csp?.toLowerCase().includes("frame-ancestors"));

  return [
    {
      id: "hsts",
      target,
      check: "Strict-Transport-Security",
      ok: Boolean(hsts),
      detail: hsts ?? "Missing",
      severity: hsts ? "info" : "fail",
    },
    {
      id: "xcto",
      target,
      check: "X-Content-Type-Options",
      ok: xcto?.toLowerCase() === "nosniff",
      detail: xcto ?? "Missing (expected nosniff)",
      severity: xcto?.toLowerCase() === "nosniff" ? "info" : "warn",
    },
    {
      id: "clickjacking",
      target,
      check: "Clickjacking protection",
      ok: frameOk,
      detail: xfo
        ? `X-Frame-Options: ${xfo}`
        : csp?.toLowerCase().includes("frame-ancestors")
          ? "CSP frame-ancestors present"
          : "Missing X-Frame-Options and CSP frame-ancestors",
      severity: frameOk ? "info" : "fail",
    },
    {
      id: "csp",
      target,
      check: "Content-Security-Policy",
      ok: Boolean(csp),
      detail: csp ? truncate(csp, 120) : "Missing",
      severity: csp ? "info" : "warn",
    },
    {
      id: "referrer",
      target,
      check: "Referrer-Policy",
      ok: Boolean(referrer),
      detail: referrer ?? "Missing",
      severity: referrer ? "info" : "warn",
    },
    {
      id: "permissions",
      target,
      check: "Permissions-Policy",
      ok: Boolean(permissions),
      detail: permissions ? truncate(permissions, 120) : "Missing",
      severity: permissions ? "info" : "info",
    },
  ];
}

function cookieFindings(target: string, headers: Headers): SecurityFinding[] {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);

  if (!lines.length) {
    return [
      {
        id: "cookies",
        target,
        check: "Set-Cookie flags",
        ok: true,
        detail: "No Set-Cookie on this probe (skipped)",
        severity: "info",
      },
    ];
  }

  const findings: SecurityFinding[] = [];
  for (const line of lines) {
    if (!line) continue;
    const name = line.split("=")[0]?.trim() || "cookie";
    const lower = line.toLowerCase();
    const secure = lower.includes("; secure") || lower.includes(";secure");
    const httpOnly =
      lower.includes("; httponly") || lower.includes(";httponly");
    const sameSite = /;\s*samesite=(strict|lax|none)/i.exec(line)?.[1];

    const ok = secure && httpOnly && Boolean(sameSite);
    findings.push({
      id: `cookie-${name}`,
      target,
      check: `Cookie: ${name}`,
      ok,
      detail: [
        secure ? "Secure" : "missing Secure",
        httpOnly ? "HttpOnly" : "missing HttpOnly",
        sameSite ? `SameSite=${sameSite}` : "missing SameSite",
      ].join(", "),
      severity: ok ? "info" : "fail",
    });
  }
  return findings;
}

function truncate(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

async function probe(target: ProbeTarget): Promise<SecurityCheckResult> {
  const checkedAt = new Date().toISOString();
  const findings: SecurityFinding[] = [requireHttps(target.url)];

  try {
    const res = await fetch(target.url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "text/html,application/json,*/*" },
    });

    findings.push(...headerFindings(target.url, res.headers));
    findings.push(...cookieFindings(target.url, res.headers));

    // Follow one redirect only to still inspect final headers if 3xx
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const next = new URL(loc, target.url).toString();
        findings.push({
          id: "redirect",
          target: target.url,
          check: "Redirect",
          ok: next.startsWith("https://"),
          detail: `${res.status} → ${next}`,
          severity: next.startsWith("https://") ? "info" : "fail",
        });
      }
    }

    // warn does not fail the target; severity "fail" does
    const hardFail = findings.some((f) => !f.ok && f.severity === "fail");

    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: !hardFail,
      findings,
      checkedAt,
      error: null,
    };
  } catch (err) {
    findings.push({
      id: "fetch",
      target: target.url,
      check: "Reachability",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      severity: "fail",
    });
    return {
      id: target.id,
      name: target.name,
      url: target.url,
      ok: false,
      findings,
      checkedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkSecurity(): Promise<SecurityCheckResult[]> {
  const api = process.env.FOUNDATION_API_BASE_URL?.replace(/\/$/, "");
  const web = process.env.FOUNDATION_WEB_BASE_URL?.replace(/\/$/, "");
  if (!api || !web) {
    throw new Error(
      "FOUNDATION_API_BASE_URL and FOUNDATION_WEB_BASE_URL are required for security checks",
    );
  }

  const targets: ProbeTarget[] = [
    {
      id: "api-health",
      name: "API /health",
      url: `${api}/api/v1/health`,
    },
    {
      id: "web-login",
      name: "Web /login",
      url: `${web}/login`,
    },
    {
      id: "web-home",
      name: "Web /",
      url: `${web}/`,
    },
  ];

  const results: SecurityCheckResult[] = [];
  for (const t of targets) {
    results.push(await probe(t));
  }
  return results;
}

export function summarizeSecurityResults(results: SecurityCheckResult[]): {
  securityOk: number;
  securityFail: number;
} {
  let securityOk = 0;
  let securityFail = 0;
  for (const r of results) {
    if (r.ok) securityOk++;
    else securityFail++;
  }
  return { securityOk, securityFail };
}
