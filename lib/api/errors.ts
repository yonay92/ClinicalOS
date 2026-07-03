export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class PermissionDeniedError extends AppError {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`, 'FORBIDDEN');
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_FAILED');
  }
}

export class DuplicateRecordError extends AppError {
  constructor(field: string) {
    super(`Duplicate record: ${field} already exists`, 'DUPLICATE_RECORD');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND');
  }
}

export class DatabaseError extends AppError {
  constructor(message: string) {
    super(`Database operation failed: ${message}`, 'INTERNAL_ERROR');
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class AIReviewRequiredError extends AppError {
  readonly request_id: string;
  constructor(request_id: string) {
    super('AI response requires review before applying', 'AI_REVIEW_REQUIRED');
    this.request_id = request_id;
  }
}
