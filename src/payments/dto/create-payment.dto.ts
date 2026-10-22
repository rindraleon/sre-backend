import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from "class-validator";
import { PaymentMethod, PaymentOperator } from "../../database/enums";

export class CreatePaymentDto {
  @ApiProperty({ format: "uuid", description: "Identifiant d'une obligation accessible au contribuable." })
  @IsUUID(undefined, { message: "Identifiant invalide." })
  obligationId!: string;

  @ApiProperty({ enum: PaymentMethod, description: "Mode déclaré; aucun opérateur bancaire n'est appelé." })
  @IsEnum(PaymentMethod, { message: "La valeur sélectionnée est invalide." })
  mode!: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentOperator, description: "Opérateur déclaré, requis pour MOBILE_MONEY." })
  @ValidateIf(
    (data: CreatePaymentDto) => data.mode === PaymentMethod.MOBILE_MONEY,
  )
  @IsEnum(PaymentOperator, {
    message: "La valeur sélectionnée est invalide.",
  })
  operateur?: PaymentOperator;

  @ApiPropertyOptional({ minLength: 7, maxLength: 40, description: "Téléphone utilisé, requis pour MOBILE_MONEY." })
  @ValidateIf(
    (data: CreatePaymentDto) => data.mode === PaymentMethod.MOBILE_MONEY,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(7, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  telephoneUtilise?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 140, description: "Banque ou canal saisi par l'utilisateur; aucune intégration bancaire n'est effectuée." })
  @ValidateIf(
    (data: CreatePaymentDto) =>
      data.mode === PaymentMethod.BANK_TRANSFER,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 140, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  banqueOuCanal?: string;

  @ApiPropertyOptional({ maxLength: 180, description: "Nom déclaré du payeur." })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  titulairePayeur?: string;

  @ApiProperty({ minLength: 3, maxLength: 128, description: "Référence saisie et vérifiée manuellement par le service; ce n'est pas une preuve de transfert." })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 128, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceTransaction!: string;

  @ApiProperty({ format: "date-time", description: "Date déclarée de la transaction, au format ISO 8601." })
  @IsDateString({}, { message: "Date invalide (format AAAA-MM-JJ attendu)." })
  dateTransaction!: string;

  @ApiPropertyOptional({ maxLength: 200, description: "Nom de fichier justificatif si une pièce est transmise au service." })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 200, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  justificatifNom?: string;
}
