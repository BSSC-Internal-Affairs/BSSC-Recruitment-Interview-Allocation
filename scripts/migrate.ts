import { readFile } from "node:fs/promises";
import { pool, transaction } from "../src/server/db";
await transaction(async (client) => {
  await client.query(await readFile("db/001_initial.sql", "utf8"));
});
console.log("Database migration complete.");
await pool.end();
