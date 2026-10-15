import { IsString, Matches } from "class-validator";

export class ChangePasswordDto {
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  motDePasseActuel!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.",
  })
  nouveauMotDePasse!: string;
}
