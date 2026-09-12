import { randomUUID } from "node:crypto";
import { pool, transaction } from "../src/server/db";
await transaction(async (client) => {
  const { rows } = await client.query("SELECT id FROM form_fields LIMIT 1");
  if (rows.length) {
    console.log("Form already configured; seed skipped.");
    return;
  }
  const fields = [
    ["Full name", "text", true, []],
    ["Email address", "email", true, []],
    ["Phone number", "tel", true, []],
    ["Student ID", "text", true, []],
    [
      "Preferred division",
      "select",
      true,
      [
        "Human Resources",
        "Public Relations",
        "Social & Environment",
        "Art & Sport",
        "Entrepreneurship",
      ],
    ],
    ["Anything you’d like us to know?", "textarea", false, []],
  ];
  for (const [i, field] of fields.entries()) {
    const id = randomUUID();
    await client.query("INSERT INTO form_fields VALUES ($1,$2,$3,$4,$5,$6)", [
      id,
      field[0],
      field[1],
      field[2],
      i,
      JSON.stringify(field[3]),
    ]);
    if (i === 0)
      await client.query(
        "UPDATE form_configuration SET name_field_id=$1 WHERE id=1",
        [id],
      );
  }
  console.log(
    "Example form fields created. Add interview dates and slots in the dashboard.",
  );
});
await pool.end();
