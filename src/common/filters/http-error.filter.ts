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
 * Format d'erreur unique renvoyé au frontend :
 * { statusCode, message, errors?: { champ: string[] }, timestamp }
 * Aucune stack trace, aucun secret, aucun détail interne n'est exposé.
 * Les erreurs 5xx sont journalisées côté serveur uniquement.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly journal = new Logger(HttpErrorFilter.name);

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
    let errors: Record<string, string[]> | undefined;
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
        const erreursBrutes = (corps as { errors?: unknown }).errors;
        if (
          erreursBrutes &&
          typeof erreursBrutes === "object" &&
          !Array.isArray(erreursBrutes) &&
          Object.values(erreursBrutes as Record<string, unknown>).every(
            (valeur) =>
              Array.isArray(valeur) &&
              valeur.every((element) => typeof element === "string"),
          )
        ) {
          errors = erreursBrutes as Record<string, string[]>;
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
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
    });
  }
}
