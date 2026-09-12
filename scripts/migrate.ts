import { readFile, readdir } from "node:fs/promises";
import { pool, transaction } from "../src/server/db";
await transaction(async (client) => {
  await client.query(await readFile("db/001_initial.sql", "utf8"));
});
// Later migrations own their transaction, so they can also be pasted directly
// into the Supabase SQL Editor on an existing deployment.
for (const file of (await readdir("db"))
  .filter((file) => /^\d+_.*\.sql$/.test(file) && file !== "001_initial.sql")
  .sort()) {
  await pool.query(await readFile(`db/${file}`, "utf8"));
}
console.log("Database migration complete.");
await pool.end();
