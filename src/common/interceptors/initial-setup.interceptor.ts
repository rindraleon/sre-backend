import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { SETUP_EXEMPT_KEY } from "../decorators/setup-exempt.decorator";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

/** Server-side blocking of business features during the initial setup: as long as `mustChangePassword` is true or t. */
@Injectable()
export class InitialSetupInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const exempt = this.reflector.getAllAndOverride<boolean>(
      SETUP_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!exempt) {
      const request = context
        .switchToHttp()
        .getRequest<{ user?: AuthenticatedUser }>();
      const user = request.user;
      if (
        user &&
        (user.mustChangePassword || !user.isProfileComplete)
      ) {
        throw new ForbiddenException(
          "Configuration initiale requise : définissez votre mot de passe et validez votre profil avant d'accéder aux fonctionnalités.",
        );
      }
    }
    return next.handle();
  }
}
