import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodeValue } from './error-codes';

/** Domain error with a stable `code`; rendered by AllExceptionsFilter into the standard error envelope. */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}
