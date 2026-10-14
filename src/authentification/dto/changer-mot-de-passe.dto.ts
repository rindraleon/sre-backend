import { IsString, Matches } from "class-validator";

export class ChangerMotDePasseDto {
  @IsString()
  motDePasseActuel!: string;

  @IsString()
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{10,128}$/, {
    message:
      "Le nouveau mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.",
  })
  nouveauMotDePasse!: string;
}
