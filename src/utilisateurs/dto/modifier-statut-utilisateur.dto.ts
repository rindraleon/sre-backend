import { IsEnum } from "class-validator";
import { StatutCompte } from "../../base-de-donnees/enums";

export class ModifierStatutUtilisateurDto {
  @IsEnum(StatutCompte)
  statut!: StatutCompte;
}
