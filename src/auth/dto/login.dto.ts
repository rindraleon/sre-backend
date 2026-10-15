import { IsEmail, IsString, Length } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 128, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motDePasse!: string;
}
