import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { CONFIGURATION_LIBRE_KEY } from "../decorators/configuration-libre.decorator";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

/**
 * Blocage serveur des fonctionnalités métier pendant la configuration initiale :
 * tant que `changementMotDePasseRequis` est vrai ou que le profil n'est pas
 * complété, seules les routes marquées `@ConfigurationLibre()` restent
 * accessibles à l'utilisateur authentifié. Les routes publiques (sans
 * utilisateur attaché) ne sont pas concernées.
 */
@Injectable()
export class ConfigurationInitialeInterceptor implements NestInterceptor {
  constructor(private readonly reflecteur: Reflector) {}

  intercept(contexte: ExecutionContext, suivant: CallHandler): Observable<unknown> {
    const libre = this.reflecteur.getAllAndOverride<boolean>(
      CONFIGURATION_LIBRE_KEY,
      [contexte.getHandler(), contexte.getClass()],
    );
    if (!libre) {
      const requete = contexte
        .switchToHttp()
        .getRequest<{ user?: AuthenticatedUser }>();
      const utilisateur = requete.user;
      if (
        utilisateur &&
        (utilisateur.changementMotDePasseRequis || !utilisateur.profilComplete)
      ) {
        throw new ForbiddenException(
          "Configuration initiale requise : définissez votre mot de passe et validez votre profil avant d'accéder aux fonctionnalités.",
        );
      }
    }
    return suivant.handle();
  }
}
