import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsString, Length, ValidateIf } from "class-validator";
import { PaymentStatus } from "../../database/enums";

export class PaymentDecisionDto {
  @ApiProperty({ enum: PaymentStatus, description: "Statut administratif final ou demande de correction." })
  @IsEnum(PaymentStatus, { message: "La valeur sélectionnée est invalide." })
  statut!: PaymentStatus;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 1500,
    description: "Motif obligatoire pour un rejet ou une demande de correction; omis pour CONFIRME.",
  })
  @ValidateIf(
    (data: PaymentDecisionDto) => data.statut !== PaymentStatus.CONFIRMED,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(5, 1500, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motif?: string;
}
