import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import {
  PeriodiciteImpot,
  TypeContribuable,
} from "../../base-de-donnees/enums";

export class CreerTypeImpotDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(2, 160)
  nom!: string;

  @IsString()
  @Length(0, 2000)
  description!: string;

  @IsString()
  @Length(2, 100)
  categorie!: string;

  @IsIn(["TOUS", TypeContribuable.PARTICULIER, TypeContribuable.ENTREPRISE])
  contribuablesConcernes!: "TOUS" | TypeContribuable;

  @IsEnum(PeriodiciteImpot)
  periodicite!: PeriodiciteImpot;

  @IsString()
  @Length(0, 220)
  regleEcheance!: string;

  @IsIn(["FIXE", "CALCULE", "MANUEL"])
  modeMontant!: "FIXE" | "CALCULE" | "MANUEL";

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999999999999999)
  montantReference?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  champsComplementaires?: string[];

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
