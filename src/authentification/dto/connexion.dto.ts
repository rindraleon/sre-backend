import { IsEmail, IsString, Length } from "class-validator";

export class ConnexionDto {
  @IsEmail()
  courriel!: string;

  @IsString()
  @Length(1, 128)
  motDePasse!: string;
}
