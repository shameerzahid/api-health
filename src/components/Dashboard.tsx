"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApiCheckResult,
  CheckRun,
  PageCheckResult,
  StrategyScores,
} from "@/lib/types";

const PASSWORD_KEY = "hm_dashboard_password";

type ApiFilter = "all" | "ok" | "fail";

function ScorePill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">—</span>;
  const tone =
    value >= 90 ? "hm-badge-ok" : value >= 50 ? "hm-badge-warn" : "hm-badge-fail";
  return <span className={`hm-badge ${tone}`}>{value}</span>;
}

function LcpCell({ ms }: { ms: number | null }) {
  const bad = ms != null && ms >= 2500;
  return (
    <span className={`font-mono text-xs tabular-nums ${bad ? "text-fail" : "text-muted"}`}>
      {ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`}
    </span>
  );
}

function StrategyCells({ s }: { s: StrategyScores }) {
  if (s.error) {
    return (
      <td colSpan={6} className="max-w-[14rem] truncate text-xs text-fail" title={s.error}>
        {s.error}
      </td>
    );
  }
  return (
    <>
      <td><ScorePill value={s.performance} /></td>
      <td><ScorePill value={s.accessibility} /></td>
      <td><ScorePill value={s.bestPractices} /></td>
      <td><ScorePill value={s.seo} /></td>
      <td><LcpCell ms={s.lcpMs} /></td>
      <td className="font-mono text-xs tabular-nums text-muted">{s.cls ?? "—"}</td>
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

function SectionTitle({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {title}
        </h2>
        {meta ? <div className="mt-1 text-sm text-muted">{meta}</div> : null}
      </div>
      {actions}
    </div>
  );
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
  const [foundationUpdatedAt, setFoundationUpdatedAt] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [inventoryStats, setInventoryStats] = useState<{
    total: number;
    smokeCount: number;
    byMethod: Record<string, number>;
    generatedAt: string;
  } | null>(null);
  const [showInventory, setShowInventory] = useState(false);
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
          const body = (await res.json().catch(() => ({}))) as { error?: string };
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
    await load();
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

  if (needsPassword && !unlocked) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
        <form
          onSubmit={onUnlock}
          className="w-full max-w-sm space-y-5 border border-border bg-surface p-6"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Health Monitor
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Unlock</h1>
            <p className="mt-1 text-sm text-muted">
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
          <button type="submit" className="hm-btn hm-btn-primary w-full">
            Continue
          </button>
          {error && <p className="text-sm text-fail">{error}</p>}
        </form>
      </div>
    );
  }

  // Foundation CRM login is required before the monitor UI
  if (!sessionReady || loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (!foundationEmail) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16">
        <form
          onSubmit={(e) => void onConnect(e)}
          className="w-full max-w-sm space-y-5 border border-border bg-surface p-6"
        >
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">
              Health Monitor
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Sign in to Foundation
            </h1>
            <p className="mt-1 text-sm text-muted">
              Use an owner/manager account. Password is not stored — only session
              tokens.
            </p>
          </div>
          <label className="block space-y-1 text-xs text-muted">
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
          <label className="block space-y-1 text-xs text-muted">
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
            {connecting ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="text-sm text-fail">{error}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold tracking-tight sm:text-lg">
                Health Monitor
              </h1>
              <span className="hm-badge hm-badge-muted">Foundation</span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
              <span>
                Last run{" "}
                <span className="text-foreground">{formatWhen(run?.checkedAt)}</span>
              </span>
              {run && (
                <>
                  <span className="text-border-strong">|</span>
                  <span>
                    APIs{" "}
                    <span className={apiFail ? "text-fail" : "text-ok"}>
                      {apiOk}/{apiTotal}
                    </span>
                  </span>
                  <span>
                    Pages{" "}
                    <span className={pageFail ? "text-fail" : "text-ok"}>
                      {pageOk}/{pageOk + pageFail}
                    </span>
                  </span>
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={running || loading}
            className="hm-btn hm-btn-primary min-w-[7.5rem]"
          >
            {running ? "Running…" : "Run now"}
          </button>
        </div>
        {running && (
          <div className="h-0.5 w-full overflow-hidden bg-border">
            <div className="h-full w-1/3 animate-pulse bg-accent" />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-5 py-6 sm:px-6 sm:py-8">
        {/* Status + connect — one strip */}
        <section className="grid gap-4 border border-border bg-surface p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6 sm:p-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="hm-dot hm-dot-ok" />
              <span>
                Connected as{" "}
                <span className="font-medium text-foreground">{foundationEmail}</span>
                <span className="ml-2 font-mono text-xs text-muted">
                  {formatWhen(foundationUpdatedAt)}
                </span>
              </span>
            </div>

            {inventoryStats && (
              <p className="font-mono text-xs text-muted">
                Inventory{" "}
                <span className="text-foreground">{inventoryStats.total}</span> routes ·
                smoke{" "}
                <span className="text-foreground">{inventoryStats.smokeCount}</span> GET
                {Object.entries(inventoryStats.byMethod).length > 0 && (
                  <>
                    {" "}
                    ·{" "}
                    {Object.entries(inventoryStats.byMethod)
                      .map(([m, n]) => `${m} ${n}`)
                      .join(" · ")}
                  </>
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => void onDisconnect()}
              disabled={connecting}
              className="hm-btn hm-btn-ghost"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setShowInventory((v) => !v)}
              className="hm-btn hm-btn-ghost"
            >
              {showInventory ? "Hide inventory" : "All routes"}
            </button>
          </div>
        </section>

        {showInventory && (
          <section>
            <SectionTitle
              title="API inventory"
              meta="Full foundation-be route list. Smoke = GET without path params (tenant/public)."
            />
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
                </tbody>
              </table>
            </div>
          </section>
        )}

        {error && (
          <p className="border border-fail/30 bg-fail/10 px-3 py-2 text-sm text-fail">
            {error}
          </p>
        )}

        {running && (
          <p className="text-sm text-muted">
            Check in progress — API smoke + PageSpeed can take several minutes.
          </p>
        )}

        {loading && !run && !running && (
          <p className="text-sm text-muted">Loading latest results…</p>
        )}

        {!loading && !run && !error && !running && (
          <p className="border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No runs yet. Click <span className="text-foreground">Run now</span> to
            start.
          </p>
        )}

        <section>
          <SectionTitle
            title="API smoke"
            meta={
              run
                ? `${filteredApis.length} shown · ${apiOk} ok · ${apiFail} fail`
                : "Results appear after a run"
            }
            actions={
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
                      apiFilter === f ? "hm-btn-primary" : "hm-btn-ghost"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            }
          />
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
                    <td className="max-w-[12rem] truncate font-medium" title={r.name}>
                      {r.name.replace(/^GET\s+/i, "")}
                    </td>
                    <td className="font-mono text-xs text-muted">{r.method}</td>
                    <td className="max-w-[20rem] truncate font-mono text-xs" title={r.path}>
                      {r.path}
                    </td>
                    <td>
                      <span
                        className={`hm-badge ${r.ok ? "hm-badge-ok" : "hm-badge-fail"}`}
                        title={r.error ?? undefined}
                      >
                        <span className={`hm-dot ${r.ok ? "hm-dot-ok" : "hm-dot-fail"}`} />
                        {r.statusCode ?? "err"}
                        {!r.ok && r.error ? (
                          <span className="max-w-[10rem] truncate opacity-80">
                            {r.error.replace(/^HTTP\s+/, "")}
                          </span>
                        ) : null}
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
                    <td colSpan={6} className="py-6 text-center text-muted">
                      {run ? "No rows match this filter." : "No API results yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionTitle
            title="Pages · PageSpeed"
            meta="P / A11Y / BP / SEO · green ≥90 · amber 50–89 · red &lt;50 · LCP red if ≥2.5s"
          />
          <div className="hm-scroll">
            <table className="hm-table min-w-[56rem]">
              <thead>
                <tr>
                  <th rowSpan={2} className="align-bottom">
                    Page
                  </th>
                  <th colSpan={6} className="text-center normal-case tracking-normal">
                    Mobile
                  </th>
                  <th colSpan={6} className="text-center normal-case tracking-normal">
                    Desktop
                  </th>
                </tr>
                <tr>
                  {["P", "A11Y", "BP", "SEO", "LCP", "CLS", "P", "A11Y", "BP", "SEO", "LCP", "CLS"].map(
                    (h, i) => (
                      <th key={`${h}-${i}`}>{h}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {(run?.pageResults ?? []).map((p: PageCheckResult) => (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-muted">{p.path}</div>
                    </td>
                    <StrategyCells s={p.mobile} />
                    <StrategyCells s={p.desktop} />
                  </tr>
                ))}
                {!run?.pageResults?.length && (
                  <tr>
                    <td colSpan={13} className="py-6 text-center text-muted">
                      No page results yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
