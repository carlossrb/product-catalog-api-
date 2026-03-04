import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response, Request } from "express";
import { QueryFailedError, EntityNotFoundError } from "typeorm";

interface PostgresError {
  code: string;
  detail?: string;
  constraint?: string;
}

@Catch(QueryFailedError, EntityNotFoundError)
export class TypeormExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(TypeormExceptionFilter.name);

  catch(
    exception: QueryFailedError | EntityNotFoundError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message } = this.resolveError(exception);

    this.logger.warn({
      message: "TypeORM error",
      method: request.method,
      path: request.url,
      error: exception.message,
      requestId: request.headers["x-request-id"],
    });

    response.status(status).json({
      statusCode: status,
      message,
      requestId: request.headers["x-request-id"],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveError(exception: QueryFailedError | EntityNotFoundError): {
    status: number;
    message: string;
  } {
    if (exception instanceof EntityNotFoundError) {
      return { status: HttpStatus.NOT_FOUND, message: "Resource not found" };
    }

    const pgError = exception.driverError as unknown as
      | PostgresError
      | undefined;
    const code = pgError?.code;

    if (code === "23505") {
      const detail = pgError?.detail ?? "Unique constraint violation";
      return { status: HttpStatus.CONFLICT, message: detail };
    }

    if (code === "23503") {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "Foreign key constraint violation",
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Database error",
    };
  }
}
