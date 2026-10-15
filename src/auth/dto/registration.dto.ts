import { Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from "class-validator";
import { TaxpayerType } from "../../database/enums";
import { SRE_REGION } from "../../database/region";

export class RegistrationProfileDto {
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
  prenom?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  raisonSociale?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nomCommercial?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nif?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
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
  representantLegal?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nomContact?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  prenomContact?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  fonctionContact?: string;
}

export class RegistrationDto {
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 160, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  nom!: string;

  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  motDePasse!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RegistrationProfileDto)
  profil?: RegistrationProfileDto;
}
