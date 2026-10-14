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

export class CreerObligationDto {
  @IsUUID()
  contribuableId!: string;

  @IsUUID()
  typeImpotId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 64)
  referenceFiscale?: string;

  @IsString()
  @Length(1, 80)
  periode!: string;

  @IsInt()
  @Min(0)
  @Max(999999999999999)
  montant!: number;

  @IsDateString()
  echeance!: string;
}
