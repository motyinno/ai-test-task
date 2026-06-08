import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import 'express-session';

type SessionRecord = Record<string, unknown>;

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const session = request.session as unknown as SessionRecord;
    if (!session?.['principal']) {
      throw new UnauthorizedException('Not authenticated');
    }
    return true;
  }
}
