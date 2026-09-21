export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public retryAfter?: number,
    public code?: string,
  ) {
    super(message);
  }
}
