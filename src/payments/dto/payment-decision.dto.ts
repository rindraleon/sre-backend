import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from "class-validator";
import { PaymentStatus } from "../../database/enums";

export class PaymentDecisionDto {
  @IsEnum(PaymentStatus, { message: "La valeur sélectionnée est invalide." })
  statut!: PaymentStatus;

  @ValidateIf(
    (donnees: PaymentDecisionDto) => donnees.statut !== PaymentStatus.CONFIRME,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(5, 1500, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motif?: string;
}
