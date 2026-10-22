import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Length, Matches } from "class-validator";

export class ForgotPasswordDto {
  @ApiProperty({ format: "email" })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: "Jeton de réinitialisation reçu par courriel." })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(32, 128, { message: "Jeton de réinitialisation invalide." })
  jeton!: string;

  @ApiProperty({ format: "password", minLength: 10, maxLength: 128 })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  nouveauMotDePasse!: string;
}
