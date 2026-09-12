import type {
  Booking,
  FormConfig,
  InterviewDate,
  SubmissionDetail,
  SubmissionSummary,
} from "@/types";
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new RequestError(
      result.error?.message || "Request failed.",
      response.status,
      result.error?.fields,
    );
  return result.data;
}
export const api = {
  form: () => request<FormConfig>("form"),
  schedules: () => request<InterviewDate[]>("schedules"),
  submit: (body: unknown) => request<Booking>("submissions", "POST", body),
  responses: () => request<SubmissionSummary[]>("admin/submissions"),
  response: (id: string) =>
    request<SubmissionDetail>(`admin/submissions/${id}`),
  saveForm: (body: FormConfig) =>
    request<FormConfig>("admin/form", "PUT", body),
};
