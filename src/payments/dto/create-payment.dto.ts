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
  @IsUUID(undefined, { message: "Identifiant invalide." })
  obligationId!: string;

  @IsEnum(PaymentMethod, { message: "La valeur sélectionnée est invalide." })
  mode!: PaymentMethod;

  @ValidateIf(
    (donnees: CreatePaymentDto) => donnees.mode === PaymentMethod.MOBILE_MONEY,
  )
  @IsEnum(PaymentOperator, {
    message: "La valeur sélectionnée est invalide.",
  })
  operateur?: PaymentOperator;

  @ValidateIf(
    (donnees: CreatePaymentDto) => donnees.mode === PaymentMethod.MOBILE_MONEY,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(7, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  telephoneUtilise?: string;

  @ValidateIf(
    (donnees: CreatePaymentDto) =>
      donnees.mode === PaymentMethod.VIREMENT_BANCAIRE,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 140, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  banqueOuCanal?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  titulairePayeur?: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 128, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceTransaction!: string;

  @IsDateString({}, { message: "Date invalide (format AAAA-MM-JJ attendu)." })
  dateTransaction!: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 200, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  justificatifNom?: string;
}
