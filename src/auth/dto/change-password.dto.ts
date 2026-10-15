import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({ format: "password" })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  motDePasseActuel!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @ApiProperty({ format: "password", minLength: 10, maxLength: 128 })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  nouveauMotDePasse!: string;
}
