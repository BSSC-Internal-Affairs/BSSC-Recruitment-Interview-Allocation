import test from "node:test";
import assert from "node:assert/strict";
import {
  configSchema,
  slotSchema,
  validateAnswers,
  participantSchema,
  submissionSchema,
  responseFiltersSchema,
} from "../src/server/validators";
import type { FormField } from "../src/types";
const id = "44238d62-8ec1-45c0-a712-c9ab07ad860d";
const field = (type: FormField["type"], required = true): FormField => ({
  id,
  label: "Answer",
  type,
  required,
  order: 0,
  options: ["A", "B"],
});
test('participant identities normalize email and anonymous submissions require an invitation',()=>{
  assert.equal(participantSchema.parse({fullName:' Test ',email:' Person@Example.com '}).email,'person@example.com');
  assert.equal(submissionSchema.safeParse({slotId:id,idempotencyKey:id,answers:{}}).success,false);
  assert.equal(responseFiltersSchema.safeParse({weekday:'7'}).success,false);
  assert.equal(responseFiltersSchema.parse({weekday:'0',page:'2'}).weekday,0);
});
test("required fields reject whitespace; optional fields can be blank", () => {
  assert.ok(validateAnswers([field("text")], { [id]: "  " })[id]);
  assert.deepEqual(validateAnswers([field("email", false)], {}), {});
});
test("validates email, phone, numeric and dropdown answers", () => {
  for (const [type, value] of [
    ["email", "invalid"],
    ["tel", "letters"],
    ["number", "Infinity"],
    ["select", "C"],
  ] as const)
    assert.ok(validateAnswers([field(type)], { [id]: value })[id]);
  for (const [type, value] of [
    ["email", "name@example.com"],
    ["tel", "+62 812-3456-7890"],
    ["number", "-1.5"],
    ["select", "A"],
  ] as const)
    assert.deepEqual(validateAnswers([field(type)], { [id]: value }), {});
});
test("rejects stale fields", () =>
  assert.ok(validateAnswers([], { obsolete: "answer" }).obsolete));
test("requires an explicitly mapped required text name field", () => {
  assert.equal(
    configSchema.safeParse({
      title: "Form",
      description: "",
      instructions: "",
      nameFieldId: id,
      fields: [field("text")],
    }).success,
    true,
  );
  assert.equal(
    configSchema.safeParse({
      title: "Form",
      description: "",
      instructions: "",
      nameFieldId: id,
      fields: [field("email")],
    }).success,
    false,
  );
});
test("rejects invalid time ranges and capacities", () => {
  const slot = {
    interviewDateId: id,
    startTime: "09:00",
    endTime: "09:30",
    capacity: 5,
  };
  assert.ok(slotSchema.safeParse(slot).success);
  for (const patch of [
    { endTime: "08:00" },
    { capacity: 0 },
    { capacity: 1.5 },
    { startTime: "25:00" },
  ])
    assert.equal(slotSchema.safeParse({ ...slot, ...patch }).success, false);
});
