import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const passport = require('passport') as typeof import('passport');
import { HttpExceptionFilter } from '../errors/http-exception.filter';
import { AllExceptionsFilter } from '../errors/all-exceptions.filter';
import { setupSession } from '../session/session.setup';

/**
 * Shared bootstrap configuration — called by both main.ts and e2e test setups.
 *
 * Wires in order:
 *   1. express-session (Postgres store)
 *   2. passport.initialize (required for @nestjs/passport LocalAuthGuard)
 *   3. Global prefix
 *   4. Global validation pipe
 *   5. Global exception filters (AllExceptions + HttpException)
 *
 * Note: passport.session() is intentionally NOT called because this application
 * manages its own session principal (req.session.principal) rather than using
 * passport's built-in serialize/deserialize mechanism.
 *
 * TenantMiddleware is registered via AppModule.configure() so it runs
 * after session/passport and before guards in the middleware pipeline (C1 fix).
 *
 * C3: Ensures production and test setups are identical — single source of truth.
 */
export async function bootstrapApp(app: INestApplication): Promise<void> {
  // 1. Session (express-session with Postgres store)
  setupSession(app);

  // 2. Passport initialize (required for passport-local strategy)
  app.use(passport.initialize());

  // 3. Global prefix
  app.setGlobalPrefix('api/v1');

  // 4. Validation
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 5. Exception filters — AllExceptions catches unknown errors; HttpException is more specific.
  // NestJS applies filters in reverse order, so AllExceptionsFilter must be registered first
  // (HttpExceptionFilter registered last = highest priority for HttpExceptions).
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());
}
