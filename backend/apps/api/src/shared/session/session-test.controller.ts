/**
 * Test-only controller used in session e2e tests (A8).
 * Only registered when NODE_ENV === 'test'.
 */
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { Session } from 'express-session';

type RequestWithSession = ExpressRequest & { session: Session & Record<string, unknown> };

@Controller('session-test')
export class SessionTestController {
  @Post('set')
  set(@Body() body: { value: string }, @Req() req: RequestWithSession): { ok: boolean } {
    req.session['testValue'] = body.value;
    return { ok: true };
  }

  @Get('get')
  get(@Req() req: RequestWithSession): { value: unknown } {
    return { value: req.session['testValue'] };
  }
}
