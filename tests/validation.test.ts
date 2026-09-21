import test from "node:test";
import assert from "node:assert/strict";
import {
  configSchema,
  dateVisibilitySchema,
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
test("NIM is required, normalized as text, and invitation tokens do not grant access", () => {
  assert.equal(
    participantSchema.parse({ fullName: " Test ", nim: " 00123456 " }).nim,
    "00123456",
  );
  for (const nim of [
    undefined,
    "",
    "  ",
    "12e3",
    "12 34",
    12345,
    "1".repeat(33),
  ])
    assert.equal(
      participantSchema.safeParse({ fullName: "Test", nim }).success,
      false,
    );
  assert.equal(
    submissionSchema.safeParse({
      slotId: id,
      idempotencyKey: id,
      invitationToken: "a".repeat(64),
      answers: {},
    }).success,
    false,
  );
  assert.equal(
    responseFiltersSchema.safeParse({ weekday: "7" }).success,
    false,
  );
  assert.equal(
    responseFiltersSchema.parse({ weekday: "0", page: "2" }).weekday,
    0,
  );
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
      isActive: true,
      closedMessage: "Registration closed.",
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
      isActive: true,
      closedMessage: "Registration closed.",
      description: "",
      instructions: "",
      nameFieldId: id,
      fields: [field("email")],
    }).success,
    false,
  );
});
test("form status requires a boolean and a nonblank bounded closed message", () => {
  const config = {
    title: "Form",
    description: "",
    instructions: "",
    nameFieldId: id,
    fields: [field("text")],
    isActive: false,
    closedMessage: " Registration closed. ",
  };
  assert.equal(
    configSchema.parse(config).closedMessage,
    "Registration closed.",
  );
  for (const patch of [
    { isActive: "false" },
    { isActive: undefined },
    { closedMessage: " " },
    { closedMessage: "x".repeat(2001) },
    { closedMessage: undefined },
  ])
    assert.equal(
      configSchema.safeParse({ ...config, ...patch }).success,
      false,
    );
});
test("schedule visibility accepts only an explicit boolean and no unrelated edits", () => {
  for (const isVisible of [true, false])
    assert.ok(dateVisibilitySchema.safeParse({ isVisible }).success);
  for (const value of [
    {},
    { isVisible: "false" },
    { isVisible: null },
    { isVisible: false, date: "2099-01-01" },
  ]) {
    assert.equal(dateVisibilitySchema.safeParse(value).success, false);
  }
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
