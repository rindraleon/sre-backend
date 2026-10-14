import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from "class-validator";
import { StatutPaiement } from "../../base-de-donnees/enums";

export class DecisionPaiementDto {
  @IsEnum(StatutPaiement)
  statut!: StatutPaiement;

  @ValidateIf(
    (donnees: DecisionPaiementDto) =>
      donnees.statut !== StatutPaiement.CONFIRME,
  )
  @IsString()
  @Length(5, 1500)
  motif?: string;
}
