export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = "BAD_REQUEST", details?: unknown) {
    super(400, code, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = "NOT_FOUND", details?: unknown) {
    super(404, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT", details?: unknown) {
    super(409, code, message, details);
  }
}
