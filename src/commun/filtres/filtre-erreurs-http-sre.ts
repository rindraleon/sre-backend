import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class FiltreErreursHttpSre implements ExceptionFilter {
  private readonly journal = new Logger(FiltreErreursHttpSre.name);

  catch(exception: unknown, hote: ArgumentsHost) {
    const contexteHttp = hote.switchToHttp();
    const requete = contexteHttp.getRequest<Request>();
    const reponse = contexteHttp.getResponse<Response>();
    const statut =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] =
      "Une erreur interne est survenue. Réessayez plus tard.";
    if (
      exception instanceof HttpException &&
      statut < HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      const corps = exception.getResponse();
      if (typeof corps === "string") {
        message = corps;
      } else if (corps && typeof corps === "object") {
        const detail = (corps as { message?: unknown }).message;
        if (
          typeof detail === "string" ||
          (Array.isArray(detail) &&
            detail.every((element) => typeof element === "string"))
        ) {
          message = detail;
        } else {
          message = exception.message;
        }
      }
    } else {
      const detailJournal =
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : String(exception);
      this.journal.error(
        `${requete.method} ${requete.originalUrl ?? requete.url}`,
        detailJournal,
      );
    }

    if (reponse.headersSent) return;
    reponse.status(statut).json({
      statusCode: statut,
      message,
      horodatage: new Date().toISOString(),
      chemin: requete.originalUrl ?? requete.url,
    });
  }
}
