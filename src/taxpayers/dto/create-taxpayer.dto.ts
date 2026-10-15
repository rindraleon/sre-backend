import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { TaxpayerType } from "../../database/enums";
import { SRE_REGION } from "../../database/region";

export class CreateTaxpayerDto {
  @IsEnum(TaxpayerType, { message: "La valeur sélectionnée est invalide." })
  type!: TaxpayerType;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nom!: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  prenom?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  raisonSociale?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  nomCommercial?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  nif?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  stat?: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 220, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  adresse!: string;

  @IsIn([SRE_REGION], { message: `La région doit être « ${SRE_REGION} ».` })
  region!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  ville!: string;

  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(7, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  telephone!: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  representantLegal?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  nomContact?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  prenomContact?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  fonctionContact?: string;
}
