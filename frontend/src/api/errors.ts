export interface ApiErrorDetail {
  field?: string;
  message: string;
}

/**
 * Typed error from the Nest error envelope:
 * { statusCode, message, error, errorCode, details }
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly details: ApiErrorDetail[];

  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}
