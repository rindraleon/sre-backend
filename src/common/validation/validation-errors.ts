import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

/**
 * Aplati les erreurs class-validator (y compris les objets imbriqués,
 * ex. `profil.telephone`) en dictionnaire indexé par nom de champ.
 * Les messages proviennent des décorateurs des DTO (en français).
 */
export function buildFieldErrors(
  erreurs: ValidationError[],
  prefixe = "",
): Record<string, string[]> {
  const parChamp: Record<string, string[]> = {};
  for (const erreur of erreurs) {
    const chemin = prefixe ? `${prefixe}.${erreur.property}` : erreur.property;
    const messages = erreur.constraints
      ? Object.values(erreur.constraints)
      : [];
    if (messages.length) {
      parChamp[chemin] = [...(parChamp[chemin] ?? []), ...messages];
    }
    if (erreur.children?.length) {
      Object.assign(parChamp, buildFieldErrors(erreur.children, chemin));
    }
  }
  return parChamp;
}

/** Exception de validation au format consommé par le filtre global et le frontend. */
export function createValidationException(erreurs: ValidationError[]) {
  return new BadRequestException({
    message: "Données invalides.",
    errors: buildFieldErrors(erreurs),
  });
}
