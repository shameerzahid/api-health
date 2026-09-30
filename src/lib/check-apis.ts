import { API_TARGETS, type ApiTarget } from "../../config/targets";
import { resolveMonitorToken } from "./foundation-auth";
import type { ApiCheckResult } from "./types";

const TIMEOUT_MS = 12_000;
const CONCURRENCY = 8;

function baseUrl(): string {
  const base = process.env.FOUNDATION_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new Error("FOUNDATION_API_BASE_URL is not set");
  return base;
}

function authHeaders(token: string | null): HeadersInit {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

async function checkOne(
  target: ApiTarget,
  token: string | null,
): Promise<ApiCheckResult> {
  const checkedAt = new Date().toISOString();
  const url = `${baseUrl()}${target.path}`;
  const started = Date.now();

  try {
    if (target.auth && !token) {
      return {
        id: target.id,
        name: target.name,
        method: target.method,
        path: target.path,
        statusCode: null,
        ok: false,
        latencyMs: null,
        error: "No Foundation session — connect an account on the dashboard",
        checkedAt,
      };
    }

    const res = await fetch(url, {
      method: target.method,
      headers: {
        Accept: "application/json",
        ...(target.auth ? authHeaders(token) : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    const ok = res.status >= 200 && res.status < 300;
    return {
      id: target.id,
      name: target.name,
      method: target.method,
      path: target.path,
      statusCode: res.status,
      ok,
      latencyMs,
      error: ok ? null : `HTTP ${res.status}`,
      checkedAt,
    };
  } catch (err) {
    return {
      id: target.id,
      name: target.name,
      method: target.method,
      path: target.path,
      statusCode: null,
      ok: false,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      checkedAt,
    };
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

export async function checkApis(): Promise<ApiCheckResult[]> {
  let token: string | null = null;
  try {
    token = await resolveMonitorToken();
  } catch (err) {
    const loginError = err instanceof Error ? err.message : String(err);
    const checkedAt = new Date().toISOString();
    // Still probe public routes; auth routes get the login error
    return mapPool(API_TARGETS, CONCURRENCY, async (target) => {
      if (target.auth) {
        return {
          id: target.id,
          name: target.name,
          method: target.method,
          path: target.path,
          statusCode: null,
          ok: false,
          latencyMs: null,
          error: loginError,
          checkedAt,
        };
      }
      return checkOne(target, null);
    });
  }

  return mapPool(API_TARGETS, CONCURRENCY, (t) => checkOne(t, token));
}
