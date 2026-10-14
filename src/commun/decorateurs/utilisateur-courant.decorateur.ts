import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UtilisateurAuthentifie } from "../interfaces/utilisateur-authentifie.interface";

export const UtilisateurCourant = createParamDecorator(
  (_donnees: unknown, contexte: ExecutionContext): UtilisateurAuthentifie => {
    const requete = contexte
      .switchToHttp()
      .getRequest<{ user: UtilisateurAuthentifie }>();
    return requete.user;
  },
);
