import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Catch-all exception filter for non-HttpException errors (H7).
 *
 * Prevents raw Error instances (including stack traces) from leaking to clients.
 * Maps all unknown errors to a sanitised 500 in the standard error envelope:
 *   { statusCode, message, error }
 *
 * Must be registered BEFORE HttpExceptionFilter so it has lower priority
 * (NestJS applies filters in reverse registration order — last registered wins).
 *
 * Registration order in bootstrapApp:
 *   app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter())
 * → HttpExceptionFilter handles HttpException; AllExceptionsFilter handles everything else.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    // Let HttpExceptionFilter handle HTTP exceptions
    if (exception instanceof HttpException) {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log full error server-side (never sent to client)
    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
