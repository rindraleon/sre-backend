import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { TaxPeriodicity, TaxpayerType } from "../../database/enums";

export class CreateTaxTypeDto {
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 32, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  code!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 160, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nom!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(0, 2000, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  description!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 100, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  categorie!: string;

  @IsIn(["TOUS", TaxpayerType.PARTICULIER, TaxpayerType.ENTREPRISE], {
    message: "La valeur sélectionnée est invalide.",
  })
  contribuablesConcernes!: "TOUS" | TaxpayerType;

  @IsEnum(TaxPeriodicity, { message: "La valeur sélectionnée est invalide." })
  periodicite!: TaxPeriodicity;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(0, 220, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  regleEcheance!: string;

  @IsIn(["FIXE", "CALCULE", "MANUEL"], {
    message: "La valeur sélectionnée est invalide.",
  })
  modeMontant!: "FIXE" | "CALCULE" | "MANUEL";

  @IsOptional()
  @IsInt({ message: "Ce champ doit être un nombre entier." })
  @Min(0, { message: "La valeur doit être au moins de $constraint1." })
  @Max(999999999999999, {
    message: "La valeur doit être au plus de $constraint1.",
  })
  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 999999999999999 })
  montantReference?: number;

  @IsOptional()
  @IsArray({ message: "Ce champ doit être une liste." })
  @IsString({
    each: true,
    message: "Chaque élément doit être une chaîne de caractères.",
  })
  @ApiPropertyOptional({ type: [String] })
  champsComplementaires?: string[];

  @IsOptional()
  @IsBoolean({ message: "Ce champ doit être un booléen." })
  @ApiPropertyOptional()
  actif?: boolean;
}
