import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";

export class CreateObligationDto {
  @IsUUID(undefined, { message: "Identifiant invalide." })
  contribuableId!: string;

  @IsUUID(undefined, { message: "Identifiant invalide." })
  typeImpotId!: string;

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 64, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @ApiPropertyOptional({ minLength: 3, maxLength: 64 })
  referenceFiscale?: string;

  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 80, {
    message:
      "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  periode!: string;

  @IsInt({ message: "Ce champ doit être un nombre entier." })
  @Min(0, { message: "La valeur doit être au moins de $constraint1." })
  @Max(999999999999999, {
    message: "La valeur doit être au plus de $constraint1.",
  })
  montant!: number;

  @IsDateString({}, { message: "Date invalide (format AAAA-MM-JJ attendu)." })
  echeance!: string;
}
