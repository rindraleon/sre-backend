import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * Authentifie les notifications du mécanisme de paiement.
 *
 * Le corps brut de la requête est signé par le prestataire en HMAC-SHA256 avec le
 * secret partagé `PAYMENT_WEBHOOK_SECRET`. Sans secret configuré, l'endpoint est
 * fermé : aucune confirmation non vérifiable n'est acceptée.
 *
 * En-têtes acceptés : `x-sre-signature` (hexadécimal) ou `x-signature`.
 */
@Injectable()
export class PaymentProviderGuard implements CanActivate {
  private readonly logger = new Logger(PaymentProviderGuard.name);

  constructor(private readonly configuration: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configuration.get<string>("PAYMENT_WEBHOOK_SECRET")?.trim();
    if (!secret || secret.length < 24) {
      throw new ServiceUnavailableException(
        "Le mécanisme de confirmation n'est pas configuré : PAYMENT_WEBHOOK_SECRET est absent ou trop court.",
      );
    }

    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = (
      request.headers["x-sre-signature"] ??
      request.headers["x-signature"] ??
      ""
    )
      .toString()
      .trim()
      .replace(/^sha256=/i, "")
      .toLowerCase();

    if (!signature || !/^[0-9a-f]{64}$/.test(signature)) {
      throw new UnauthorizedException("Signature du prestataire absente ou mal formée.");
    }

    const payload =
      request.rawBody ??
      Buffer.from(
        typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {}),
        "utf8",
      );
    const expected = createHmac("sha256", secret).update(payload).digest();

    let received: Buffer;
    try {
      received = Buffer.from(signature, "hex");
    } catch {
      throw new UnauthorizedException("Signature du prestataire invalide.");
    }

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      this.logger.warn("Callback de paiement rejeté : signature invalide.");
      throw new UnauthorizedException("Signature du prestataire invalide.");
    }
    return true;
  }
}
