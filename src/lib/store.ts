import { neon } from "@neondatabase/serverless";
import type {
  ApiCheckResult,
  CheckRun,
  CheckRunSummary,
  PageCheckResult,
} from "./types";

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

export async function ensureSchema(): Promise<void> {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS check_runs (
      id SERIAL PRIMARY KEY,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      summary JSONB NOT NULL,
      api_results JSONB NOT NULL,
      page_results JSONB NOT NULL
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS monitor_session (
      id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      email TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function saveRun(input: {
  summary: CheckRunSummary;
  apiResults: ApiCheckResult[];
  pageResults: PageCheckResult[];
}): Promise<CheckRun> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO check_runs (summary, api_results, page_results)
    VALUES (
      ${JSON.stringify(input.summary)}::jsonb,
      ${JSON.stringify(input.apiResults)}::jsonb,
      ${JSON.stringify(input.pageResults)}::jsonb
    )
    RETURNING id, checked_at, summary, api_results, page_results
  `;
  const row = rows[0];
  return mapRow(row);
}

export async function getLatestRun(): Promise<CheckRun | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT id, checked_at, summary, api_results, page_results
    FROM check_runs
    ORDER BY checked_at DESC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

export type MonitorSessionPublic = {
  email: string;
  updatedAt: string;
};

export type MonitorSession = MonitorSessionPublic & {
  accessToken: string;
  refreshToken: string;
};

export async function saveMonitorSession(input: {
  email: string;
  accessToken: string;
  refreshToken: string;
}): Promise<MonitorSessionPublic> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO monitor_session (id, email, access_token, refresh_token, updated_at)
    VALUES (1, ${input.email}, ${input.accessToken}, ${input.refreshToken}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      updated_at = NOW()
    RETURNING email, updated_at
  `;
  const row = rows[0];
  return {
    email: String(row.email),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function getMonitorSession(): Promise<MonitorSession | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT email, access_token, refresh_token, updated_at
    FROM monitor_session
    WHERE id = 1
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    email: String(row.email),
    accessToken: String(row.access_token),
    refreshToken: String(row.refresh_token),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export async function getMonitorSessionPublic(): Promise<MonitorSessionPublic | null> {
  const s = await getMonitorSession();
  if (!s) return null;
  return { email: s.email, updatedAt: s.updatedAt };
}

export async function clearMonitorSession(): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`DELETE FROM monitor_session WHERE id = 1`;
}

function mapRow(row: Record<string, unknown>): CheckRun {
  return {
    id: Number(row.id),
    checkedAt:
      row.checked_at instanceof Date
        ? row.checked_at.toISOString()
        : String(row.checked_at),
    summary: row.summary as CheckRunSummary,
    apiResults: row.api_results as ApiCheckResult[],
    pageResults: row.page_results as PageCheckResult[],
  };
}
