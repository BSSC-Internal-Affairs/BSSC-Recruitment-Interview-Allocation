export const fieldTypes = [
  "text",
  "email",
  "tel",
  "number",
  "textarea",
  "select",
] as const;
export type FieldType = (typeof fieldTypes)[number];
export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  order: number;
  options: string[];
}
export interface FormConfig {
  isActive: boolean;
  closedMessage: string;
  title: string;
  description: string;
  instructions: string;
  nameFieldId: string | null;
  nimFieldId?: string | null;
  fields: FormField[];
}
export interface Slot {
  id: string;
  interviewDateId: string;
  startTime: string;
  endTime: string;
  capacity: number;
  registeredCount: number;
}
export interface InterviewDate {
  id: string;
  date: string;
  isVisible: boolean;
  slots: Slot[];
}
export interface SubmissionSummary {
  id: string;
  formId: string;
  fullName: string;
  submittedAt: string;
  date: string;
  startTime: string;
  endTime: string;
}
export interface SubmissionDetail extends SubmissionSummary {
  date: string;
  startTime: string;
  endTime: string;
  answers: { fieldId: string; label: string; value: string }[];
}
export interface Booking {
  formId: string;
  date: string;
  startTime: string;
  endTime: string;
}
export type ScheduleLookupResult =
  | { found: false }
  | {
      found: true;
      schedule: { date: string; startTime: string; endTime: string };
    };
export interface Participant {
  id: string;
  fullName: string;
  nim: string | null;
  createdAt: string;
  updatedAt: string;
  formId: string | null;
  submissionId: string | null;
  submittedAt: string | null;
}
export interface ResponseFilters {
  q?: string;
  date?: string;
  weekday?: string;
  time?: string;
  sort?:
    | "submitted_desc"
    | "submitted_asc"
    | "interview_asc"
    | "interview_desc"
    | "name_asc";
  page?: number;
}
export interface ResponseList {
  items: SubmissionSummary[];
  total: number;
  page: number;
  pageSize: number;
  dates: string[];
  times: string[];
}
