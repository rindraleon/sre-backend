import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CLE_ROLES } from "../decorateurs/roles.decorateur";
import { UtilisateurAuthentifie } from "../interfaces/utilisateur-authentifie.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflecteur: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const roles = this.reflecteur.getAllAndOverride<string[]>(CLE_ROLES, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const requete = contexte
      .switchToHttp()
      .getRequest<{ user?: UtilisateurAuthentifie }>();
    return Boolean(requete.user && roles.includes(requete.user.role));
  }
}
