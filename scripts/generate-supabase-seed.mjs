import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MATERIAL_CATALOG_SEED } from "../src/data/materialCatalog.js";
import { WORK_CATALOG_SEED } from "../src/data/workCatalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const outputPath = resolve(rootDir, "supabase/seed.sql");

function toSqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function buildValues(items, mapper) {
  return items.map((item) => `  (${mapper(item).join(", ")})`).join(",\n");
}

const materialValues = buildValues(MATERIAL_CATALOG_SEED, (item) => [
  toSqlString(item.id),
  toSqlString(item.code),
  toSqlString(item.description),
  toSqlString(item.unit || "τεμ.")
]);

const workValues = buildValues(WORK_CATALOG_SEED, (item) => [
  toSqlString(item.id),
  toSqlString(item.article),
  toSqlString(item.description)
]);

const sql = `begin;

insert into public.material_catalog (
  catalog_key,
  code,
  description,
  unit
)
values
${materialValues}
on conflict (catalog_key) do update
set
  code = excluded.code,
  description = excluded.description,
  unit = excluded.unit,
  is_active = true,
  updated_at = now();

insert into public.work_catalog (
  catalog_key,
  article,
  description
)
values
${workValues}
on conflict (catalog_key) do update
set
  article = excluded.article,
  description = excluded.description,
  is_active = true,
  updated_at = now();

commit;
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, sql, "utf8");

console.log(
  `Generated ${outputPath} with ${MATERIAL_CATALOG_SEED.length} materials and ${WORK_CATALOG_SEED.length} work catalog rows.`
);
