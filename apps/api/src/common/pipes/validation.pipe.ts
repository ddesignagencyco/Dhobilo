import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Global pipe (TRD §5.1): whitelist, reject unknown props, transform to DTO types. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new AppException(ErrorCode.VALIDATION_FAILED, 'Request failed validation', HttpStatus.BAD_REQUEST, flatten(errors)),
  });
}
