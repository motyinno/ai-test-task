import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantContext } from './tenant-context';

const CLS_TENANT_KEY = 'tenantContext';
const CLS_SYSTEM_KEY = 'systemContext';

@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  set(ctx: TenantContext): void {
    this.cls.set(CLS_TENANT_KEY, ctx);
  }

  get(): TenantContext | undefined {
    return this.cls.get<TenantContext>(CLS_TENANT_KEY);
  }

  setSystemContext(value: boolean): void {
    this.cls.set(CLS_SYSTEM_KEY, value);
  }

  isSystemContext(): boolean {
    return this.cls.get<boolean>(CLS_SYSTEM_KEY) === true;
  }
}
