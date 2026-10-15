import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Length } from "class-validator";

export class LoginDto {
  @ApiProperty({ format: "email", example: "contribuable@example.mg" })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @ApiProperty({ minLength: 1, maxLength: 128, format: "password" })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 128, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motDePasse!: string;
}
