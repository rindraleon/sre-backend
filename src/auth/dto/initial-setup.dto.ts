import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";
import { UpdateTaxpayerProfileDto } from "../../taxpayers/dto/update-taxpayer-profile.dto";

/**
 * Initial setup (first sign-in): replacement of the provisional
 * password and profile validation, in a single atomic operation.
 */
export class InitialSetupDto {
  @ApiProperty({
    format: "password",
    description:
      "Mot de passe actuel (provisoire : numéro STAT transmis à la création du compte).",
    example: "4689241V",
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  motDePasseActuel!: string;

  @ApiProperty({
    format: "password",
    minLength: 10,
    maxLength: 128,
    description:
      "Nouveau mot de passe personnel : 10 caractères minimum, une majuscule, une minuscule et un chiffre.",
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  nouveauMotDePasse!: string;

  @ApiPropertyOptional({
    type: UpdateTaxpayerProfileDto,
    description:
      "Modifications du profil à enregistrer pendant la configuration initiale.",
  })
  @ValidateNested()
  @Type(() => UpdateTaxpayerProfileDto)
  profil?: UpdateTaxpayerProfileDto;
}
