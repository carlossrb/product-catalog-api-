import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response, Request } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      throw exception;
    }

    const message =
      exception instanceof Error ? exception.message : "Internal server error";

    this.logger.error({
      message: "Unhandled exception",
      method: request.method,
      path: request.url,
      error: message,
      requestId: request.headers["x-request-id"],
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
      requestId: request.headers["x-request-id"],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
