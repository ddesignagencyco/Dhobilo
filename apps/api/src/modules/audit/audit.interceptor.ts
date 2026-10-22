import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { Observable, mergeMap } from 'rxjs';
import { AUDIT_KEY, AuditOptions } from './audit.decorator';
import { AuditService } from './audit.service';

type AuthedRequest = Request & { id?: string; user?: { id: string; role: Role } };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions | undefined>(AUDIT_KEY, context.getHandler());
    if (!options) return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    return next.handle().pipe(
      mergeMap(async (result) => {
        const entityId =
          (options.idParam ? req.params?.[options.idParam] : undefined) ??
          (result as { id?: string } | null | undefined)?.id;
        if (entityId) {
          await this.audit.recordSafely({
            action: options.action,
            entity: options.entity,
            entityId: String(entityId),
            actorId: req.user?.id,
            actorRole: req.user?.role,
            ip: req.ip,
            requestId: req.id,
          });
        }
        return result;
      }),
    );
  }
}
