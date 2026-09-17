import type {
  Booking,
  FormConfig,
  InterviewDate,
  SubmissionDetail,
  ResponseFilters,
  ResponseList,
  Participant,
  ScheduleLookupResult,
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
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
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
  lookupSchedule: (nim: string) =>
    request<ScheduleLookupResult>(
      "public/schedule-lookup",
      "POST",
      { nim },
      AbortSignal.timeout(15000),
    ),
  submit: (body: unknown) => request<Booking>("submissions", "POST", body),
  responses: (filters: ResponseFilters = {}) => {
    const query = new URLSearchParams(
      Object.entries(filters)
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([key, value]) => [key, String(value)]),
    );
    return request<ResponseList>(`admin/submissions?${query}`);
  },
  participants: () => request<Participant[]>("admin/participants"),
  createParticipant: (body: { fullName: string; nim: string }) =>
    request<Participant>("admin/participants", "POST", body),
  updateParticipant: (id: string, body: { fullName: string; nim: string }) =>
    request<Participant>(`admin/participants/${id}`, "PUT", body),
  deleteParticipant: (id: string) =>
    request<{ success: boolean }>(`admin/participants/${id}`, "DELETE"),
  response: (id: string) =>
    request<SubmissionDetail>(`admin/submissions/${id}`),
  saveForm: (body: FormConfig) =>
    request<FormConfig>("admin/form", "PUT", body),
};
