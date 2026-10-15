import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Length } from "class-validator";

export class UpdateTaxpayerProfileDto {
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 220, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  adresse?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 120, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  ville?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(7, 40, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  telephone?: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional()
  nomCommercial?: string;
}
