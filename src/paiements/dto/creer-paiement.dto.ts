import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from "class-validator";
import { ModePaiement, OperateurPaiement } from "../../base-de-donnees/enums";

export class CreerPaiementDto {
  @IsUUID()
  obligationId!: string;

  @IsEnum(ModePaiement)
  mode!: ModePaiement;

  @ValidateIf(
    (donnees: CreerPaiementDto) => donnees.mode === ModePaiement.MOBILE_MONEY,
  )
  @IsEnum(OperateurPaiement)
  operateur?: OperateurPaiement;

  @ValidateIf(
    (donnees: CreerPaiementDto) => donnees.mode === ModePaiement.MOBILE_MONEY,
  )
  @IsString()
  @Length(7, 40)
  telephoneUtilise?: string;

  @ValidateIf(
    (donnees: CreerPaiementDto) =>
      donnees.mode === ModePaiement.VIREMENT_BANCAIRE,
  )
  @IsString()
  @Length(2, 140)
  banqueOuCanal?: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  titulairePayeur?: string;

  @IsString()
  @Length(3, 128)
  referenceTransaction!: string;

  @IsDateString()
  dateTransaction!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  justificatifNom?: string;
}
