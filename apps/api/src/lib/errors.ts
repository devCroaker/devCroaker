import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_error";

const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  internal_error: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status(): ContentfulStatusCode {
    return STATUS_BY_CODE[this.code];
  }
}

export function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } };
}

export function respondWithError(c: Context, error: ApiError) {
  return c.json(errorBody(error.code, error.message), error.status);
}
