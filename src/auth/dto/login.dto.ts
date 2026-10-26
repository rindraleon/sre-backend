import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Length, Matches } from "class-validator";

export class LoginDto {
  @ApiProperty({ format: "email", example: "contribuable@example.mg" })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @ApiProperty({
    minLength: 1,
    maxLength: 128,
    format: "password",
    description:
      "Mot de passe personnel — ou mot de passe provisoire (numéro STAT) lors de la première connexion.",
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 128, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motDePasse!: string;

  /** @deprecated Kept for compatibility with existing clients, but ignored: authentication is based on the e-mail add. */
  @ApiPropertyOptional({
    deprecated: true,
    description:
      "Champ ignoré. Conservé pour compatibilité ; le STAT n'est plus une pièce d'authentification.",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^[A-Za-z0-9.\-\/]{2,32}$/, {
    message: "Format de numéro STAT invalide.",
  })
  stat?: string;
}
