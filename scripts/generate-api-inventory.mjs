#!/usr/bin/env node
/**
 * Parse foundation-be Nest controllers → config/api-inventory.json
 *
 * Usage:
 *   FOUNDATION_BE_SRC=../foundation-project/foundation-be/src npm run generate:api-inventory
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root =
  process.env.FOUNDATION_BE_SRC ||
  path.resolve(__dirname, "../../foundation-project/foundation-be/src");

if (!fs.existsSync(root)) {
  console.error(`foundation-be src not found: ${root}`);
  console.error("Set FOUNDATION_BE_SRC to foundation-be/src");
  process.exit(1);
}

const files = [];
function walk(d) {
  for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.name.endsWith(".controller.ts")) files.push(p);
  }
}
walk(root);

const PREFIX = "/api/v1";
const routes = [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const ctrlMatch = code.match(
    /@Controller\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/,
  );
  if (!ctrlMatch) continue;
  const ctrl = (ctrlMatch[1] ?? ctrlMatch[2] ?? "")
    .replace(/^\//, "")
    .replace(/\/$/, "");

  const re = /@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const method = m[1].toUpperCase();
    const sub = (m[2] ?? m[3] ?? "").replace(/^\//, "");
    let full = PREFIX;
    if (ctrl) full += `/${ctrl}`;
    if (sub) full += `/${sub}`;
    full = full.replace(/\/+/g, "/");

    const hasParam = /:/.test(full);
    const base = path.basename(file);
    const isPublicFile = /public-/i.test(base);
    const auth = !(
      full === "/api/v1/health" ||
      isPublicFile ||
      /\/public\//.test(full)
    );

    let surface = "tenant";
    if (full.startsWith("/api/v1/field") || full.startsWith("/api/v1/field-")) {
      surface = "field";
    } else if (full.startsWith("/api/v1/platform")) {
      surface = "platform";
    } else if (!auth) {
      surface = "public";
    }

    const smoke =
      method === "GET" &&
      !hasParam &&
      (surface === "tenant" || surface === "public");

    const id = `${method.toLowerCase()}-${full}`
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();

    routes.push({
      id,
      name: `${method} ${full}`,
      method,
      path: full,
      auth,
      hasParam,
      surface,
      smoke,
    });
  }
}

const seen = new Set();
const unique = [];
for (const r of routes) {
  const k = `${r.method} ${r.path}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(r);
}
unique.sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
);

const out = path.resolve(__dirname, "../config/api-inventory.json");
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: root,
      total: unique.length,
      smokeCount: unique.filter((r) => r.smoke).length,
      routes: unique,
    },
    null,
    2,
  ),
);

console.log(
  `Wrote ${unique.length} routes (${unique.filter((r) => r.smoke).length} smoke GETs) → ${out}`,
);
