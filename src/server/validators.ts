import { z } from "zod";
import { fieldTypes, type FormField } from "../types";
export const fieldSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(120),
    type: z.enum(fieldTypes),
    required: z.boolean(),
    order: z.number().int().min(0).max(100),
    options: z.array(z.string().trim().min(1).max(150)).max(100).default([]),
  })
  .refine((f) => f.type !== "select" || f.options.length > 0, {
    message: "Dropdowns need at least one option.",
  });
export const configSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000),
    instructions: z.string().max(4000),
    nameFieldId: z.uuid().nullable(),
    nimFieldId: z.uuid().nullable().default(null),
    fields: z.array(fieldSchema).max(50),
  })
  .superRefine((c, ctx) => {
    if (
      c.nimFieldId &&
      (c.nimFieldId === c.nameFieldId ||
        !c.fields.some(
          (f) => f.id === c.nimFieldId && f.type === "text" && f.required,
        ))
    )
      ctx.addIssue({
        code: "custom",
        message: "The NIM field must be a separate required text field.",
      });
    if (new Set(c.fields.map((f) => f.id)).size !== c.fields.length)
      ctx.addIssue({ code: "custom", message: "Field IDs must be unique." });
    if (
      c.nameFieldId &&
      !c.fields.some(
        (f) => f.id === c.nameFieldId && f.type === "text" && f.required,
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "The full-name field must be a required text field.",
      });
    if (c.fields.length && !c.nameFieldId)
      ctx.addIssue({ code: "custom", message: "Choose a full-name field." });
  });
export const dateSchema = z.object({ date: z.iso.date() });
export const slotSchema = z
  .object({
    interviewDateId: z.uuid(),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    capacity: z.number().int().min(1).max(10000),
  })
  .refine((s) => s.endTime > s.startTime, {
    message: "End time must be after start time.",
  });
export const nimSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{1,32}$/, "Enter a valid NIM using digits only.");
export const submissionSchema = z.object({
  nim: nimSchema,
  slotId: z.uuid(),
  idempotencyKey: z.uuid(),
  answers: z.record(z.string(), z.string().max(4000)),
});
export const participantSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(200),
  nim: nimSchema,
});
export const responseFiltersSchema = z.object({
  q: z.string().trim().max(200).default(""),
  date: z.iso.date().optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  sort: z
    .enum([
      "submitted_desc",
      "submitted_asc",
      "interview_asc",
      "interview_desc",
      "name_asc",
    ])
    .default("submitted_desc"),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
});
export function validateAnswers(
  fields: FormField[],
  answers: Record<string, string>,
) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (answers[field.id] ?? "").trim();
    if (field.required && !value)
      errors[field.id] = `${field.label} is required.`;
    else if (value) {
      if (value.length > 4000)
        errors[field.id] = "Use 4,000 characters or fewer.";
      else if (field.type === "email" && !z.email().safeParse(value).success)
        errors[field.id] = "Enter a valid email address.";
      else if (field.type === "tel" && !/^\+?[0-9 ()-]{7,25}$/.test(value))
        errors[field.id] = "Enter a valid phone number.";
      else if (
        field.type === "number" &&
        !/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)
      )
        errors[field.id] = "Enter a valid number.";
      else if (field.type === "select" && !field.options.includes(value))
        errors[field.id] = "Choose an available option.";
    }
  }
  for (const key of Object.keys(answers))
    if (!fields.some((f) => f.id === key))
      errors[key] = "The form has changed. Refresh and try again.";
  return errors;
}
