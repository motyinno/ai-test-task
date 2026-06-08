import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SessionPrincipal } from './strategies/local.strategy';

export interface ActiveContext {
  profileId?: string;
  trainerId?: string;
  label?: string;
}

export interface ImpersonationPair {
  realAdminId: string;
  impersonatedSubjectId: string;
  impersonationStartedAt: string;
}

export interface ChildPrincipal {
  childProfileId: string;
  parentUserId: string;
  permissionConstraints: string[];
  tokenSpendAllowed: boolean;
}

export interface SessionPayload {
  /** (c) Active context — which profile + which trainer */
  principal?: SessionPrincipal;
  activeContext?: ActiveContext;
  /** (a) Impersonation pair */
  impersonation?: ImpersonationPair;
  /** (b) Child-under-parent constrained principal */
  childPrincipal?: ChildPrincipal;
}

type SessionRecord = Record<string, unknown>;

@Injectable()
export class SessionContextService {
  getPrincipal(req: Request): SessionPrincipal | undefined {
    const session = req.session as unknown as SessionRecord;
    return session['principal'] as SessionPrincipal | undefined;
  }

  setPrincipal(req: Request, principal: SessionPrincipal): void {
    const session = req.session as unknown as SessionRecord;
    session['principal'] = principal;
  }

  getActiveContext(req: Request): ActiveContext | undefined {
    const session = req.session as unknown as SessionRecord;
    return session['activeContext'] as ActiveContext | undefined;
  }

  setActiveContext(req: Request, ctx: ActiveContext): void {
    const session = req.session as unknown as SessionRecord;
    session['activeContext'] = ctx;
  }

  getImpersonation(req: Request): ImpersonationPair | undefined {
    const session = req.session as unknown as SessionRecord;
    return session['impersonation'] as ImpersonationPair | undefined;
  }

  setImpersonation(req: Request, pair: ImpersonationPair): void {
    const session = req.session as unknown as SessionRecord;
    session['impersonation'] = pair;
  }

  clearImpersonation(req: Request): void {
    const session = req.session as unknown as SessionRecord;
    delete session['impersonation'];
  }

  getChildPrincipal(req: Request): ChildPrincipal | undefined {
    const session = req.session as unknown as SessionRecord;
    return session['childPrincipal'] as ChildPrincipal | undefined;
  }

  setChildPrincipal(req: Request, child: ChildPrincipal): void {
    const session = req.session as unknown as SessionRecord;
    session['childPrincipal'] = child;
  }

  destroySession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.destroy((err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
