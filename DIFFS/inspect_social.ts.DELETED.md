# Deleted File: inspect_social.ts

This file existed in the original upload and was removed. Original content preserved for the audit trail:

```
import fs from "fs";
import initSqlJs from "sql.js";

async function inspectDbFile(filePath: string) {
  console.log(`\n================ INSPECTING: ${filePath} ================`);
  if (!fs.existsSync(filePath)) {
    console.log(`File does not exist: ${filePath}`);
    return;
  }
  const fileBuffer = fs.readFileSync(filePath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);

  const tables = ["workspaces", "users", "sessions", "social_accounts", "social_posts"];
  for (const table of tables) {
    console.log(`\n--- TABLE: ${table} ---`);
    try {
      const stmt = db.prepare(`SELECT * FROM ${table}`);
      let count = 0;
      while (stmt.step()) {
        console.log(JSON.stringify(stmt.getAsObject(), null, 2));
        count++;
      }
      stmt.free();
      console.log(`Count: ${count}`);
    } catch (err: any) {
      console.error(`Error reading table ${table}:`, err.message);
    }
  }
}

async function main() {
  console.log("=== DB MULTI-INSPECTOR START ===");
  await inspectDbFile("./storage/aurapost.db");
  await inspectDbFile("./storage/aurapost.db.1783066879075.backup");
  await inspectDbFile("/tmp/aurapost.db");
  console.log("\n=== DB MULTI-INSPECTOR END ===");
}

main().catch(console.error);

main().catch(console.error);
```
