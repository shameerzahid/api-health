/**
 * Smoke-check + inventory targets for Foundation API / CRM pages.
 * API list is generated from foundation-be controllers → config/api-inventory.json
 * Regenerate: npm run generate:api-inventory
 */

import inventory from "./api-inventory.json";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiTarget = {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  auth: boolean;
  surface?: "public" | "tenant" | "field" | "platform";
  hasParam?: boolean;
  smoke?: boolean;
};

export type PageTarget = {
  id: string;
  name: string;
  path: string;
};

export const API_INVENTORY: ApiTarget[] = inventory.routes as ApiTarget[];

/** GET routes without path params (tenant + public) — used by check runners */
export const API_TARGETS: ApiTarget[] = API_INVENTORY.filter((r) => r.smoke);

export const API_INVENTORY_STATS = {
  generatedAt: inventory.generatedAt as string,
  total: inventory.total as number,
  smokeCount: inventory.smokeCount as number,
  byMethod: API_INVENTORY.reduce(
    (acc, r) => {
      acc[r.method] = (acc[r.method] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  ),
};

export const PAGE_TARGETS: PageTarget[] = [
  { id: "login", name: "Login", path: "/login" },
  { id: "dashboard", name: "Dashboard", path: "/dashboard" },
  { id: "customers", name: "Customers", path: "/customer" },
  { id: "visits", name: "Visits", path: "/visits" },
  { id: "planning", name: "Planning", path: "/planning" },
  { id: "quotes", name: "Quotes", path: "/quotes" },
  { id: "employees", name: "Employees", path: "/employees" },
  { id: "invoicing", name: "Invoicing", path: "/invoicing" },
];
