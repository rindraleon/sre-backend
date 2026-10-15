import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflecteur: Reflector) {}

  canActivate(contexte: ExecutionContext): boolean {
    const roles = this.reflecteur.getAllAndOverride<string[]>(ROLES_KEY, [
      contexte.getHandler(),
      contexte.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const requete = contexte
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    return Boolean(requete.user && roles.includes(requete.user.role));
  }
}
