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
import { TypeContribuable } from "../../base-de-donnees/enums";
import { REGION_SRE } from "../../base-de-donnees/region-sre";

export class ProfilInscriptionDto {
  @IsEnum(TypeContribuable)
  type!: TypeContribuable;

  @IsString()
  @Length(1, 120)
  nom!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  prenom?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  raisonSociale?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  nomCommercial?: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  nif?: string;

  @IsOptional()
  @IsString()
  @Length(3, 40)
  stat?: string;

  @IsString()
  @Length(3, 220)
  adresse!: string;

  @IsIn([REGION_SRE], { message: `La région doit être « ${REGION_SRE} ».` })
  region!: string;

  @IsString()
  @Length(2, 120)
  ville!: string;

  @IsEmail()
  courriel!: string;

  @IsString()
  @Length(7, 40)
  telephone!: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  representantLegal?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  nomContact?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  prenomContact?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  fonctionContact?: string;
}

export class InscriptionDto {
  @IsString()
  @Length(2, 160)
  nom!: string;

  @IsEmail()
  courriel!: string;

  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{10,128}$/, {
    message:
      "Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.",
  })
  motDePasse!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfilInscriptionDto)
  profil?: ProfilInscriptionDto;
}
