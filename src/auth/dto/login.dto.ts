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

  /**
   * @deprecated Conservé pour la compatibilité des clients existants, mais
   * ignoré : l'authentification est fondée sur l'adresse e-mail et le mot de
   * passe uniquement. Le numéro STAT ne sert que de mot de passe provisoire
   * lors de la première connexion (saisi dans `motDePasse`).
   */
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
