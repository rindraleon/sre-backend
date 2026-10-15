import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser } from "../interfaces/authenticated-user.interface";

export const CurrentUser = createParamDecorator(
  (_donnees: unknown, contexte: ExecutionContext): AuthenticatedUser => {
    const requete = contexte
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return requete.user;
  },
);
