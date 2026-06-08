import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  errorCode?: string;
  details?: Array<{ field?: string; message: string }>;
}

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let body: ErrorResponse;

    if (typeof exceptionResponse === 'string') {
      body = {
        statusCode: status,
        message: exceptionResponse,
        error: HttpStatus[status] ?? 'Error',
      };
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as Record<string, unknown>;
      body = {
        statusCode: status,
        message:
          typeof resp['message'] === 'string'
            ? resp['message']
            : Array.isArray(resp['message'])
              ? (resp['message'] as string[]).join(', ')
              : exception.message,
        error: (resp['error'] as string) ?? (HttpStatus[status] as string) ?? 'Error',
        errorCode: resp['errorCode'] as string | undefined,
        details: resp['details'] as ErrorResponse['details'] | undefined,
      };
    } else {
      body = {
        statusCode: status,
        message: exception.message,
        error: HttpStatus[status] ?? 'Error',
      };
    }

    response.status(status).json(body);
  }
}
