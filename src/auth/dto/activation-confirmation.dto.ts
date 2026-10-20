import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, Length, Matches, ValidateNested } from "class-validator";
import { UpdateTaxpayerProfileDto } from "../../taxpayers/dto/update-taxpayer-profile.dto";

/**
 * Confirmation d'un lien d'activation à usage unique : définition directe du
 * mot de passe personnel (sans saisir le mot de passe provisoire).
 */
export class ActivationConfirmationDto {
  @ApiProperty({
    description: "Jeton d'activation reçu par courriel (à usage unique).",
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(32, 128, { message: "Jeton d'activation invalide." })
  jeton!: string;

  @ApiProperty({
    format: "password",
    minLength: 10,
    maxLength: 128,
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  nouveauMotDePasse!: string;

  @ApiPropertyOptional({ type: UpdateTaxpayerProfileDto })
  @ValidateNested()
  @Type(() => UpdateTaxpayerProfileDto)
  profil?: UpdateTaxpayerProfileDto;
}
