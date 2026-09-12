import { pool } from "../db";
import type { PoolClient } from "pg";
import type { FormConfig } from "../../types";
export async function getConfig(
  db: PoolClient | typeof pool = pool,
): Promise<FormConfig> {
  const {
    rows: [config],
  } = await db.query(`
    SELECT title,description,instructions,name_field_id AS "nameFieldId",
      COALESCE((SELECT json_agg(json_build_object('id',id,'label',label,'type',type,
        'required',required,'order',sort_order,'options',options) ORDER BY sort_order,id)
        FROM form_fields),'[]') AS fields
    FROM form_configuration WHERE id=1
  `);
  return config;
}
export async function saveConfig(config: FormConfig, db: PoolClient) {
  await db.query("SELECT id FROM form_configuration WHERE id=1 FOR UPDATE");
  await db.query(
    "UPDATE form_configuration SET title=$1,description=$2,instructions=$3,name_field_id=$4 WHERE id=1",
    [config.title, config.description, config.instructions, config.nameFieldId],
  );
  await db.query("DELETE FROM form_fields");
  for (const [order, f] of config.fields.entries())
    await db.query("INSERT INTO form_fields VALUES ($1,$2,$3,$4,$5,$6)", [
      f.id,
      f.label,
      f.type,
      f.required,
      order,
      JSON.stringify(f.options),
    ]);
  return getConfig(db);
}
