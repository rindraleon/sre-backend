import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Single error shape returned to the frontend:
 * { statusCode, message, errors?: { field: string[] }, timestamp }
 * No stack trace, no secret, no internal detail is exposed.
 * 5xx errors are logged server-side only.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly activityLog = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();
    const requestId =
      typeof response.locals?.requestId === "string" ? response.locals.requestId : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] =
      "Une erreur interne est survenue. Réessayez plus tard.";
    let errors: Record<string, string[]> | undefined;
    if (
      exception instanceof HttpException &&
      status < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const detail = (body as { message?: unknown }).message;
        if (
          typeof detail === "string" ||
          (Array.isArray(detail) &&
            detail.every((element) => typeof element === "string"))
        ) {
          message = detail;
        } else {
          message = exception.message;
        }
        const rawErrors = (body as { errors?: unknown }).errors;
        if (
          rawErrors &&
          typeof rawErrors === "object" &&
          !Array.isArray(rawErrors) &&
          Object.values(rawErrors as Record<string, unknown>).every(
            (value) =>
              Array.isArray(value) &&
              value.every((element) => typeof element === "string"),
          )
        ) {
          errors = rawErrors as Record<string, string[]>;
        }
      }
    } else {
      const logDetail =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);
      const path = request.path || request.route?.path || "[route inconnue]";
      this.activityLog.error(
        `${requestId ? `[${requestId}] ` : ""}${request.method} ${path}`,
        logDetail,
      );
    }

    if (response.headersSent) return;
    response.status(status).json({
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      ...(requestId ? { requestId: requestId } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
