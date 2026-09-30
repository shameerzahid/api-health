import { PAGE_TARGETS } from "../../config/targets";
import type { PageCheckResult, StrategyScores } from "./types";

const TIMEOUT_MS = 90_000;
type Strategy = "mobile" | "desktop";

function webBase(): string {
  const base = process.env.FOUNDATION_WEB_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("FOUNDATION_WEB_BASE_URL is not set");
  return base;
}

function apiKey(): string {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (!key) throw new Error("PAGESPEED_API_KEY is not set");
  return key;
}

function emptyScores(error: string): StrategyScores {
  return {
    performance: null,
    accessibility: null,
    bestPractices: null,
    seo: null,
    lcpMs: null,
    cls: null,
    error,
  };
}

function scoreOf(
  categories: Record<string, { score?: number | null } | undefined>,
  key: string,
): number | null {
  const s = categories[key]?.score;
  return typeof s === "number" ? Math.round(s * 100) : null;
}

function parsePsi(data: {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<
      string,
      { numericValue?: number; displayValue?: string }
    >;
  };
  error?: { message?: string };
}): StrategyScores {
  if (data.error?.message) return emptyScores(data.error.message);
  const lr = data.lighthouseResult;
  if (!lr?.categories) return emptyScores("Missing lighthouseResult");

  const audits = lr.audits ?? {};
  const lcp = audits["largest-contentful-paint"]?.numericValue;
  const cls = audits["cumulative-layout-shift"]?.numericValue;

  return {
    performance: scoreOf(lr.categories, "performance"),
    accessibility: scoreOf(lr.categories, "accessibility"),
    bestPractices: scoreOf(lr.categories, "best-practices"),
    seo: scoreOf(lr.categories, "seo"),
    lcpMs: typeof lcp === "number" ? Math.round(lcp) : null,
    cls: typeof cls === "number" ? Math.round(cls * 1000) / 1000 : null,
    error: null,
  };
}

async function runPsi(pageUrl: string, strategy: Strategy): Promise<StrategyScores> {
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", pageUrl);
  endpoint.searchParams.set("key", apiKey());
  endpoint.searchParams.set("strategy", strategy);
  for (const cat of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ]) {
    endpoint.searchParams.append("category", cat);
  }

  try {
    const res = await fetch(endpoint.toString(), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const data = (await res.json()) as Parameters<typeof parsePsi>[0];
    if (!res.ok) {
      return emptyScores(
        data.error?.message ?? `PSI HTTP ${res.status}`,
      );
    }
    return parsePsi(data);
  } catch (err) {
    return emptyScores(err instanceof Error ? err.message : String(err));
  }
}

export async function checkPages(): Promise<PageCheckResult[]> {
  const base = webBase();
  const results: PageCheckResult[] = [];

  for (const target of PAGE_TARGETS) {
    const checkedAt = new Date().toISOString();
    const url = `${base}${target.path}`;
    try {
      const [mobile, desktop] = await Promise.all([
        runPsi(url, "mobile"),
        runPsi(url, "desktop"),
      ]);
      results.push({
        id: target.id,
        name: target.name,
        path: target.path,
        url,
        mobile,
        desktop,
        checkedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        id: target.id,
        name: target.name,
        path: target.path,
        url,
        mobile: emptyScores(msg),
        desktop: emptyScores(msg),
        checkedAt,
      });
    }
  }

  return results;
}

export function summarizePageResults(pages: PageCheckResult[]): {
  pageOk: number;
  pageFail: number;
} {
  let pageOkCount = 0;
  let pageFail = 0;
  for (const p of pages) {
    if (p.mobile.error === null && p.desktop.error === null) pageOkCount++;
    else pageFail++;
  }
  return { pageOk: pageOkCount, pageFail };
}
