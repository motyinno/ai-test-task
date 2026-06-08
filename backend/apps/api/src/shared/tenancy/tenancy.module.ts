import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      middleware: { mount: true },
      global: true,
    }),
  ],
  providers: [TenantContextService, TenantMiddleware],
  exports: [TenantContextService, TenantMiddleware, ClsModule],
})
export class TenancyModule {}
