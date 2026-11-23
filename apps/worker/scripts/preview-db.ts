// Runs D1 commands against card-duel-preview, the database shared by every PR Preview (ADR-0010).
// `wrangler d1` only reads top-level `d1_databases`, so this writes an ignored config that binds
// DB to the database in the `previews` block of wrangler.jsonc.
//
//   node scripts/preview-db.ts migrate   Apply this checkout's migrations.
//   node scripts/preview-db.ts reset     Drop every table, then apply this checkout's migrations.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL("..", import.meta.url);
const configPath = new URL("wrangler.preview-db.json", here).pathname;

const source = JSON.parse(
  readFileSync(new URL("wrangler.jsonc", here), "utf8").replace(/^\s*\/\/.*$/gm, ""),
);
const databases = source.previews?.d1_databases;
const db = Array.isArray(databases) ? databases.find((entry) => entry.binding === "DB") : undefined;
if (!db?.database_id || db.database_id === "<REPLACE_ME>") {
  console.error(
    "Set previews.d1_databases[DB].database_id in wrangler.jsonc to the card-duel-preview database ID. See docs/authentication.md.",
  );
  process.exit(1);
}
writeFileSync(configPath, JSON.stringify({ name: source.name, d1_databases: [db] }));

const wrangler = (args: string[], capture = false) =>
  execFileSync("wrangler", [...args, "--remote", "--config", configPath], {
    stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
  });

const command = process.argv[2];
if (command === "reset") {
  const output = wrangler(
    [
      "d1",
      "execute",
      "DB",
      "--json",
      "--command",
      "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
    ],
    true,
  );
  const objects: { type: "table" | "view"; name: string }[] = JSON.parse(output)[0].results;
  if (objects.length > 0) {
    // Deferred foreign keys let tables drop in any order: nothing references them once all are gone.
    const statements = [
      "PRAGMA defer_foreign_keys = true;",
      // Views first: a table can't drop while a view still selects from it.
      ...objects
        .toSorted((a, b) => Number(a.type === "table") - Number(b.type === "table"))
        .map(
          ({ type, name }) =>
            `DROP ${type === "view" ? "VIEW" : "TABLE"} IF EXISTS "${name.replaceAll('"', '""')}";`,
        ),
    ];
    const file = join(mkdtempSync(join(tmpdir(), "preview-db-")), "reset.sql");
    writeFileSync(file, statements.join("\n"));
    console.log(`Dropping ${objects.length} tables and views from ${db.database_name}.`);
    wrangler(["d1", "execute", "DB", "--yes", "--file", file]);
  }
} else if (command !== "migrate") {
  console.error("Usage: node scripts/preview-db.ts migrate|reset");
  process.exit(1);
}
wrangler(["d1", "migrations", "apply", "DB"]);
