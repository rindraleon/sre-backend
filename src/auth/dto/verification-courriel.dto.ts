import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches } from "class-validator";

export class DemanderVerificationCourrielDto {
  @ApiProperty({ format: "email", example: "contribuable@example.mg" })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;
}

export class VerifierCourrielDto {
  @ApiProperty({ format: "email", example: "contribuable@example.mg" })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  courriel!: string;

  @ApiProperty({ example: "123456", description: "Code à usage unique reçu par courriel." })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Matches(/^[0-9]{6}$/, { message: "Le code doit contenir 6 chiffres." })
  code!: string;
}
