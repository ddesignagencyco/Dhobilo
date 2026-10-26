import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';

/**
 * Graceful stop (BE-9.7). On SIGTERM the process first reports "not ready" so the load balancer stops sending it
 * new requests, waits SHUTDOWN_DRAIN_MS for that to take effect, and only then lets Nest close the HTTP server
 * (which finishes the requests already in flight) and the database and queue connections.
 */
@Injectable()
export class ShutdownService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private draining = false;

  constructor(private readonly config: ConfigService<Env, true>) {}

  isDraining(): boolean {
    return this.draining;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    this.draining = true;
    const waitMs = this.config.get('SHUTDOWN_DRAIN_MS', { infer: true });
    this.logger.log({ signal, waitMs }, 'Shutting down: no longer ready, draining');
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
