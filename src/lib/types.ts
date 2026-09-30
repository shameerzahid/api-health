export type ApiCheckResult = {
  id: string;
  name: string;
  method: string;
  path: string;
  statusCode: number | null;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string;
};

export type StrategyScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  lcpMs: number | null;
  cls: number | null;
  error: string | null;
};

export type PageCheckResult = {
  id: string;
  name: string;
  path: string;
  url: string;
  mobile: StrategyScores;
  desktop: StrategyScores;
  checkedAt: string;
};

export type CheckRunSummary = {
  apiOk: number;
  apiFail: number;
  pageOk: number;
  pageFail: number;
};

export type CheckRun = {
  id: number;
  checkedAt: string;
  summary: CheckRunSummary;
  apiResults: ApiCheckResult[];
  pageResults: PageCheckResult[];
};
