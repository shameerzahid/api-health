"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiCheckResult,
  CheckRun,
  PageCheckResult,
  SecurityCheckResult,
  SecurityFinding,
  StrategyScores,
} from "@/lib/types";

const PASSWORD_KEY = "hm_dashboard_password";

type ApiFilter = "all" | "ok" | "fail";
type MainTab = "apis" | "pages" | "security" | "inventory";

function Spinner() {
  return <span className="hm-spinner" aria-hidden />;
}

function ScorePill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  const tone =
    value >= 90 ? "hm-badge-ok" : value >= 50 ? "hm-badge-warn" : "hm-badge-fail";
  return <span className={`hm-badge ${tone}`}>{value}</span>;
}

function LcpCell({ ms }: { ms: number | null }) {
  const bad = ms != null && ms >= 2500;
  return (
    <span
      className={`font-mono text-xs tabular-nums ${bad ? "text-fail" : "text-muted"}`}
    >
      {ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`}
    </span>
  );
}

function StrategyCells({ s }: { s: StrategyScores }) {
  if (s.error) {
    return (
      <td
        colSpan={6}
        className="max-w-[14rem] truncate text-xs text-fail"
        title={s.error}
      >
        {s.error}
      </td>
    );
  }
  return (
    <>
      <td>
        <ScorePill value={s.performance} />
      </td>
      <td>
        <ScorePill value={s.accessibility} />
      </td>
      <td>
        <ScorePill value={s.bestPractices} />
      </td>
      <td>
        <ScorePill value={s.seo} />
      </td>
      <td>
        <LcpCell ms={s.lcpMs} />
      </td>
      <td className="font-mono text-xs tabular-nums text-muted">
        {s.cls ?? "—"}
      </td>
    </>
  );
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ratioTone(fail: number) {
  return fail > 0 ? "text-fail" : "text-ok";
}

export function Dashboard() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [run, setRun] = useState<CheckRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [foundationEmail, setFoundationEmail] = useState<string | null>(null);
  const [foundationUpdatedAt, setFoundationUpdatedAt] = useState<string | null>(
    null,
  );
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [inventoryStats, setInventoryStats] = useState<{
    total: number;
    smokeCount: number;
    byMethod: Record<string, number>;
    generatedAt: string;
  } | null>(null);
  const [inventoryRoutes, setInventoryRoutes] = useState<
    {
      method: string;
      path: string;
      surface?: string;
      smoke?: boolean;
      hasParam?: boolean;
    }[]
  >([]);
  const [apiFilter, setApiFilter] = useState<ApiFilter>("all");
  const [apiQuery, setApiQuery] = useState("");
  const [tab, setTab] = useState<MainTab>("apis");

  const headers = useCallback((): HeadersInit => {
    const h: Record<string, string> = {};
    if (password) h["x-dashboard-password"] = password;
    return h;
  }, [password]);

  const loadSession = useCallback(async (h: HeadersInit) => {
    try {
      const res = await fetch("/api/foundation-session", {
        headers: h,
        cache: "no-store",
      });
      if (!res.ok) {
        setFoundationEmail(null);
        setFoundationUpdatedAt(null);
        return;
      }
      const body = (await res.json()) as {
        session: { email: string; updatedAt: string } | null;
      };
      setFoundationEmail(body.session?.email ?? null);
      setFoundationUpdatedAt(body.session?.updatedAt ?? null);
    } finally {
      setSessionReady(true);
    }
  }, []);

  const loadInventory = useCallback(async () => {
    const res = await fetch("/api/inventory", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as {
      stats: {
        total: number;
        smokeCount: number;
        byMethod: Record<string, number>;
        generatedAt: string;
      };
      routes: {
        method: string;
        path: string;
        surface?: string;
        smoke?: boolean;
        hasParam?: boolean;
      }[];
    };
    setInventoryStats(body.stats);
    setInventoryRoutes(body.routes);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionReady(false);
    try {
      const h = headers();
      const res = await fetch("/api/results", {
        headers: h,
        cache: "no-store",
      });
      if (res.status === 401) {
        setNeedsPassword(true);
        setUnlocked(false);
        setRun(null);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { run: CheckRun | null };
      setRun(body.run);
      setUnlocked(true);
      setNeedsPassword(false);
      if (password) sessionStorage.setItem(PASSWORD_KEY, password);
      await Promise.all([loadSession(h), loadInventory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSessionReady(true);
    } finally {
      setLoading(false);
    }
  }, [headers, password, loadSession, loadInventory]);

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_KEY) ?? "";
    if (saved) setPassword(saved);
    void (async () => {
      setLoading(true);
      setError(null);
      setSessionReady(false);
      try {
        const h: Record<string, string> = {};
        if (saved) h["x-dashboard-password"] = saved;
        const res = await fetch("/api/results", {
          headers: h,
          cache: "no-store",
        });
        if (res.status === 401) {
          setNeedsPassword(true);
          setUnlocked(false);
          setRun(null);
          return;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { run: CheckRun | null };
        setRun(body.run);
        setUnlocked(true);
        setNeedsPassword(false);
        await Promise.all([loadSession(h), loadInventory()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSessionReady(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadSession, loadInventory]);

  async function onUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    try {
      await load();
    } finally {
      setUnlocking(false);
    }
  }

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/foundation-session", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        session?: { email: string; updatedAt: string };
      };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFoundationEmail(body.session?.email ?? loginEmail);
      setFoundationUpdatedAt(body.session?.updatedAt ?? null);
      setSessionReady(true);
      setLoginPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/foundation-session", {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setFoundationEmail(null);
      setFoundationUpdatedAt(null);
      setSessionReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function onRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/run-checks", {
        method: "POST",
        headers: headers(),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const filteredApis = useMemo(() => {
    let rows = run?.apiResults ?? [];
    if (apiFilter === "ok") rows = rows.filter((r) => r.ok);
    if (apiFilter === "fail") rows = rows.filter((r) => !r.ok);
    const q = apiQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q) ||
          String(r.statusCode ?? "").includes(q),
      );
    }
    return rows;
  }, [run?.apiResults, apiFilter, apiQuery]);

  const apiTotal = run?.apiResults?.length ?? 0;
  const apiOk = run?.summary?.apiOk ?? 0;
  const apiFail = run?.summary?.apiFail ?? 0;
  const pageOk = run?.summary?.pageOk ?? 0;
  const pageFail = run?.summary?.pageFail ?? 0;
  const securityOk = run?.summary?.securityOk ?? 0;
  const securityFail = run?.summary?.securityFail ?? 0;

  if (needsPassword && !unlocked) {
    return (
      <div className="hm-auth-shell">
        <form onSubmit={onUnlock} className="hm-auth-card space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              Health Monitor
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Unlock</h1>
            <p className="mt-1.5 text-sm text-muted">
              Enter the dashboard password to continue.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="hm-input"
            placeholder="Password"
            autoFocus
          />
          <button
            type="submit"
            disabled={unlocking}
            className="hm-btn hm-btn-primary w-full"
          >
            {unlocking ? (
              <>
                <Spinner /> Unlocking…
              </>
            ) : (
              "Continue"
            )}
          </button>
          {error && <p className="text-sm text-fail">{error}</p>}
        </form>
      </div>
    );
  }

  if (!sessionReady || loading) {
    return (
      <div className="hm-auth-shell">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner />
          Loading monitor…
        </div>
      </div>
    );
  }

  if (!foundationEmail) {
    return (
      <div className="hm-auth-shell">
        <form
          onSubmit={(e) => void onConnect(e)}
          className="hm-auth-card space-y-5"
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              Health Monitor
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Sign in to Foundation
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Owner/manager account required. Password is not stored — only
              session tokens.
            </p>
          </div>
          <label className="block space-y-1.5 text-xs font-medium text-muted">
            Email
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              className="hm-input"
              autoFocus
            />
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-muted">
            Password
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="hm-input"
            />
          </label>
          <button
            type="submit"
            disabled={connecting}
            className="hm-btn hm-btn-primary w-full"
          >
            {connecting ? (
              <>
                <Spinner /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
          {error && <p className="text-sm text-fail">{error}</p>}
        </form>
      </div>
    );
  }

  const tabs: { id: MainTab; label: string; tone: string }[] = [
    { id: "apis", label: "API smoke", tone: "text-api" },
    { id: "pages", label: "PageSpeed", tone: "text-pages" },
    { id: "security", label: "Security", tone: "text-security" },
    { id: "inventory", label: "Inventory", tone: "text-muted" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                Health Monitor
              </h1>
              <span className="hm-badge hm-badge-muted">Foundation</span>
            </div>
            <p className="mt-1 font-mono text-xs text-muted">
              Last run{" "}
              <span className="text-foreground">{formatWhen(run?.checkedAt)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={running || loading}
            className="hm-btn hm-btn-primary min-w-[9rem]"
          >
            {running ? (
              <>
                <Spinner /> Running…
              </>
            ) : (
              "Run now"
            )}
          </button>
        </div>
        {running && (
          <div className="hm-progress">
            <span />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-5 py-6 sm:px-6 sm:py-8">
        {/* Overview */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                Overview
              </h2>
              <p className="mt-1 text-sm text-muted">
                Latest check summary across APIs, pages, and security.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="hm-dot hm-dot-ok" />
              <span>
                <span className="text-muted">Signed in as </span>
                <span className="font-medium">{foundationEmail}</span>
              </span>
              <button
                type="button"
                onClick={() => void onDisconnect()}
                disabled={connecting}
                className="hm-btn hm-btn-ghost ml-1"
              >
                {connecting ? (
                  <>
                    <Spinner /> Signing out…
                  </>
                ) : (
                  "Sign out"
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setTab("apis")}
              className={`hm-stat text-left transition ${tab === "apis" ? "ring-1 ring-api/40" : ""}`}
            >
              <div className="hm-stat-label text-api">API smoke</div>
              <div className={`hm-stat-value ${ratioTone(apiFail)}`}>
                {run ? `${apiOk}/${apiTotal || apiOk + apiFail}` : "—"}
              </div>
              <p className="mt-1 text-xs text-muted">
                {apiFail ? `${apiFail} failing` : "All passing / no run"}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTab("pages")}
              className={`hm-stat text-left transition ${tab === "pages" ? "ring-1 ring-pages/40" : ""}`}
            >
              <div className="hm-stat-label text-pages">PageSpeed</div>
              <div className={`hm-stat-value ${ratioTone(pageFail)}`}>
                {run ? `${pageOk}/${pageOk + pageFail}` : "—"}
              </div>
              <p className="mt-1 text-xs text-muted">
                Mobile + desktop Lighthouse scores
              </p>
            </button>
            <button
              type="button"
              onClick={() => setTab("security")}
              className={`hm-stat text-left transition ${tab === "security" ? "ring-1 ring-security/40" : ""}`}
            >
              <div className="hm-stat-label text-security">Security</div>
              <div className={`hm-stat-value ${ratioTone(securityFail)}`}>
                {run ? `${securityOk}/${securityOk + securityFail}` : "—"}
              </div>
              <p className="mt-1 text-xs text-muted">
                HTTPS + headers + cookie flags
              </p>
            </button>
          </div>
        </section>

        {error && (
          <p className="rounded-xl border border-fail/30 bg-fail/10 px-4 py-3 text-sm text-fail">
            {error}
          </p>
        )}

        {running && (
          <div className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/5 px-4 py-3 text-sm text-muted">
            <Spinner />
            Check in progress — API smoke, PageSpeed, and security can take several
            minutes.
          </div>
        )}

        {/* Section tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`hm-btn ${tab === t.id ? "hm-btn-active" : "hm-btn-ghost"}`}
            >
              <span className={tab === t.id ? t.tone : ""}>{t.label}</span>
            </button>
          ))}
        </div>

        {!run && !running && !loading && (
          <div className="rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
            <p className="text-base font-medium">No results yet</p>
            <p className="mt-1 text-sm text-muted">
              Run a full check to populate API, PageSpeed, and security sections.
            </p>
            <button
              type="button"
              onClick={() => void onRun()}
              disabled={running}
              className="hm-btn hm-btn-primary mt-5"
            >
              {running ? (
                <>
                  <Spinner /> Running…
                </>
              ) : (
                "Run first check"
              )}
            </button>
          </div>
        )}

        {tab === "apis" && (
          <section className="hm-panel hm-panel-accent-api">
            <div className="hm-panel-head">
              <div>
                <h2 className="text-base font-semibold text-api">API smoke</h2>
                <p className="mt-1 text-sm text-muted">
                  {run
                    ? `${filteredApis.length} shown · ${apiOk} ok · ${apiFail} fail`
                    : "Backend GET probes — status + latency"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={apiQuery}
                  onChange={(e) => setApiQuery(e.target.value)}
                  placeholder="Filter path…"
                  className="hm-input w-40 sm:w-52"
                />
                {(["all", "ok", "fail"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setApiFilter(f)}
                    className={`hm-btn ${
                      apiFilter === f ? "hm-btn-active" : "hm-btn-ghost"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="hm-panel-body">
              <div className="hm-scroll">
                <table className="hm-table min-w-[44rem]">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApis.map((r: ApiCheckResult) => (
                      <tr key={r.id}>
                        <td
                          className="max-w-[12rem] truncate font-medium"
                          title={r.name}
                        >
                          {r.name.replace(/^GET\s+/i, "")}
                        </td>
                        <td className="font-mono text-xs text-muted">
                          {r.method}
                        </td>
                        <td
                          className="max-w-[20rem] truncate font-mono text-xs"
                          title={r.path}
                        >
                          {r.path}
                        </td>
                        <td>
                          <span
                            className={`hm-badge ${r.ok ? "hm-badge-ok" : "hm-badge-fail"}`}
                            title={r.error ?? undefined}
                          >
                            <span
                              className={`hm-dot ${r.ok ? "hm-dot-ok" : "hm-dot-fail"}`}
                            />
                            {r.statusCode ?? "err"}
                          </span>
                        </td>
                        <td className="font-mono text-xs tabular-nums text-muted">
                          {r.latencyMs == null ? "—" : `${r.latencyMs}ms`}
                        </td>
                        <td className="font-mono text-xs text-muted">
                          {formatWhen(r.checkedAt)}
                        </td>
                      </tr>
                    ))}
                    {!filteredApis.length && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-muted">
                          {run
                            ? "No rows match this filter."
                            : "No API results yet."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "pages" && (
          <section className="hm-panel hm-panel-accent-pages">
            <div className="hm-panel-head">
              <div>
                <h2 className="text-base font-semibold text-pages">
                  Pages · PageSpeed
                </h2>
                <p className="mt-1 text-sm text-muted">
                  P / A11Y / BP / SEO · green ≥90 · amber 50–89 · red &lt;50 · LCP
                  red if ≥2.5s
                </p>
              </div>
            </div>
            <div className="hm-panel-body">
              <div className="hm-scroll">
                <table className="hm-table min-w-[56rem]">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="align-bottom">
                        Page
                      </th>
                      <th
                        colSpan={6}
                        className="text-center normal-case tracking-normal"
                      >
                        Mobile
                      </th>
                      <th
                        colSpan={6}
                        className="text-center normal-case tracking-normal"
                      >
                        Desktop
                      </th>
                    </tr>
                    <tr>
                      {[
                        "P",
                        "A11Y",
                        "BP",
                        "SEO",
                        "LCP",
                        "CLS",
                        "P",
                        "A11Y",
                        "BP",
                        "SEO",
                        "LCP",
                        "CLS",
                      ].map((h, i) => (
                        <th key={`${h}-${i}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(run?.pageResults ?? []).map((p: PageCheckResult) => (
                      <tr key={p.id}>
                        <td>
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-xs text-muted">
                            {p.path}
                          </div>
                        </td>
                        <StrategyCells s={p.mobile} />
                        <StrategyCells s={p.desktop} />
                      </tr>
                    ))}
                    {!run?.pageResults?.length && (
                      <tr>
                        <td colSpan={13} className="py-10 text-center text-muted">
                          No page results yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "security" && (
          <section className="hm-panel hm-panel-accent-security">
            <div className="hm-panel-head">
              <div>
                <h2 className="text-base font-semibold text-security">
                  Security
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {run
                    ? `${securityOk} ok · ${securityFail} fail · HTTPS + headers (+ cookies when present)`
                    : "HTTPS, HSTS, CSP, clickjacking, Referrer-Policy, cookie flags"}
                </p>
              </div>
            </div>
            <div className="hm-panel-body">
              <div className="hm-scroll">
                <table className="hm-table min-w-[48rem]">
                  <thead>
                    <tr>
                      <th>Target</th>
                      <th>Overall</th>
                      <th>Check</th>
                      <th>Result</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(run?.securityResults ?? []).flatMap(
                      (r: SecurityCheckResult) => {
                        const findings = r.findings.length
                          ? r.findings
                          : ([
                              {
                                id: "none",
                                target: r.url,
                                check: "—",
                                ok: r.ok,
                                detail: r.error ?? "No findings",
                                severity: r.ok ? "info" : "fail",
                              },
                            ] as SecurityFinding[]);
                        return findings.map((f, i) => (
                          <tr key={`${r.id}-${f.id}-${i}`}>
                            {i === 0 ? (
                              <td
                                rowSpan={findings.length}
                                className="align-top"
                              >
                                <div className="font-medium">{r.name}</div>
                                <div
                                  className="max-w-[16rem] truncate font-mono text-xs text-muted"
                                  title={r.url}
                                >
                                  {r.url}
                                </div>
                              </td>
                            ) : null}
                            {i === 0 ? (
                              <td
                                rowSpan={findings.length}
                                className="align-top"
                              >
                                <span
                                  className={`hm-badge ${r.ok ? "hm-badge-ok" : "hm-badge-fail"}`}
                                >
                                  {r.ok ? "pass" : "fail"}
                                </span>
                              </td>
                            ) : null}
                            <td className="text-xs">{f.check}</td>
                            <td>
                              <span
                                className={`hm-badge ${
                                  f.ok
                                    ? "hm-badge-ok"
                                    : f.severity === "warn"
                                      ? "hm-badge-warn"
                                      : "hm-badge-fail"
                                }`}
                              >
                                {f.ok ? "ok" : f.severity}
                              </span>
                            </td>
                            <td
                              className="max-w-[24rem] truncate font-mono text-xs text-muted"
                              title={f.detail}
                            >
                              {f.detail}
                            </td>
                          </tr>
                        ));
                      },
                    )}
                    {!run?.securityResults?.length && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-muted">
                          No security results yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {tab === "inventory" && (
          <section className="hm-panel hm-panel-accent-neutral">
            <div className="hm-panel-head">
              <div>
                <h2 className="text-base font-semibold">API inventory</h2>
                <p className="mt-1 text-sm text-muted">
                  {inventoryStats
                    ? `${inventoryStats.total} routes · ${inventoryStats.smokeCount} smoke GETs`
                    : "Full foundation-be route list"}
                  {inventoryStats &&
                    Object.entries(inventoryStats.byMethod).length > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        {Object.entries(inventoryStats.byMethod)
                          .map(([m, n]) => `${m} ${n}`)
                          .join(" · ")}
                      </>
                    )}
                </p>
              </div>
            </div>
            <div className="hm-panel-body">
              <div className="hm-scroll">
                <table className="hm-table min-w-[40rem]">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Path</th>
                      <th>Surface</th>
                      <th>Smoke</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRoutes.map((r) => (
                      <tr key={`${r.method}-${r.path}`}>
                        <td className="font-mono text-xs">{r.method}</td>
                        <td className="font-mono text-xs">{r.path}</td>
                        <td className="text-muted">{r.surface ?? "—"}</td>
                        <td>
                          {r.smoke ? (
                            <span className="hm-badge hm-badge-ok">yes</span>
                          ) : (
                            <span className="hm-badge hm-badge-muted">
                              {r.hasParam
                                ? "param"
                                : r.method !== "GET"
                                  ? "mutate"
                                  : (r.surface ?? "skip")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!inventoryRoutes.length && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-muted">
                          Inventory not loaded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
