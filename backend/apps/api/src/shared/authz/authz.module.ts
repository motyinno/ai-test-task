import { Global, Module } from '@nestjs/common';
import { AbilityFactory } from './ability.factory';
import { AbilityGuard } from './ability.guard';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [AbilityFactory, AbilityGuard, RolesGuard],
  exports: [AbilityFactory, AbilityGuard, RolesGuard],
})
export class AuthzModule {}
