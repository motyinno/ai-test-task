import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantContextService } from './tenant-context.service';

@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      middleware: { mount: true },
      global: true,
    }),
  ],
  providers: [TenantContextService],
  exports: [TenantContextService, ClsModule],
})
export class TenancyModule {}
