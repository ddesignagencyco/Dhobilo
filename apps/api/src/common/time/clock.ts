import { Global, Injectable, Module } from '@nestjs/common';

/** Source of "now". Injected (instead of calling `new Date()`) so slot, opening-hours and expiry logic is testable. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class TimeModule {}
