import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";
import { PaymentMethod, PaymentOperator } from "../../database/enums";

/**
 * Déclaration de paiement.
 *
 * Deux usages :
 *  - **Déclaration autonome** (contribuable) : `typeImpotId`, `montant` et, si la
 *    nature d'impôt est périodique, `periode` sont saisis par l'utilisateur.
 *    Aucune obligation fiscale préalable n'est requise.
 *  - **Déclaration rattachée à une obligation** (compatibilité) : `obligationId`
 *    suffit ; le montant et la période proviennent alors de l'obligation.
 */
export class CreatePaymentDto {
  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Obligation fiscale éventuelle. Facultative : une déclaration autonome ne l'utilise pas.",
  })
  @ValidateIf((data: CreatePaymentDto) => Boolean(data.obligationId))
  @IsUUID(undefined, { message: "Identifiant d'obligation invalide." })
  obligationId?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Nature de l'impôt déclarée. Requise hors obligation. Doit être active et applicable au contribuable.",
  })
  @ValidateIf((data: CreatePaymentDto) => !data.obligationId)
  @IsUUID(undefined, { message: "Sélectionnez une nature d'impôt valide." })
  typeImpotId?: string;

  @ApiPropertyOptional({
    example: 250000,
    description:
      "Montant déclaré en ariary (entier). Requis hors obligation. Jamais prélevé par le portail.",
  })
  @ValidateIf((data: CreatePaymentDto) => !data.obligationId)
  @Transform(({ value }) =>
    typeof value === "string" && value.trim() !== "" ? Number(value) : value,
  )
  @IsInt({ message: "Le montant doit être un nombre entier d'ariary." })
  @Min(1000, { message: "Le montant minimum déclarable est de 1 000 MGA." })
  @Max(1_000_000_000_000, {
    message: "Le montant déclaré dépasse le plafond autorisé.",
  })
  montant?: number;

  @ApiPropertyOptional({
    example: "2026-03",
    description:
      "Période fiscale déclarée. Requise si la nature d'impôt est mensuelle, trimestrielle ou annuelle.",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(4, 40, {
    message: "La période doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  @Matches(/^[0-9A-Za-z._/-]+$/, {
    message:
      "La période ne peut contenir que des chiffres, des lettres, un tiret, un point, un underscore ou une barre oblique.",
  })
  periode?: string;

  @ApiPropertyOptional({
    format: "uuid",
    description:
      "Contribuable concerné. Ignoré pour un compte client (son propre contribuable est utilisé) ; réservé à l'administration.",
  })
  @IsOptional()
  @IsUUID(undefined, { message: "Identifiant de contribuable invalide." })
  contribuableId?: string;

  @ApiProperty({ enum: PaymentMethod, description: "Canal utilisé pour l'opération." })
  @IsEnum(PaymentMethod, { message: "La valeur sélectionnée est invalide." })
  mode!: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentOperator, description: "Opérateur, requis pour MOBILE_MONEY." })
  @ValidateIf((data: CreatePaymentDto) => data.mode === PaymentMethod.MOBILE_MONEY)
  @IsEnum(PaymentOperator, { message: "La valeur sélectionnée est invalide." })
  operateur?: PaymentOperator;

  @ApiPropertyOptional({ minLength: 7, maxLength: 40, description: "Téléphone utilisé, requis pour MOBILE_MONEY." })
  @ValidateIf((data: CreatePaymentDto) => data.mode === PaymentMethod.MOBILE_MONEY)
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(7, 40, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  telephoneUtilise?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 140, description: "Banque ou canal, requis pour un virement." })
  @ValidateIf((data: CreatePaymentDto) => data.mode === PaymentMethod.BANK_TRANSFER)
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 140, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  banqueOuCanal?: string;

  @ApiPropertyOptional({ maxLength: 180, description: "Nom déclaré du payeur." })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 180, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  titulairePayeur?: string;

  @ApiProperty({
    minLength: 3,
    maxLength: 128,
    description:
      "Référence de l'opération (transfert, mobile money, dépôt). Sert au rapprochement avec le relevé du canal.",
  })
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 128, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceTransaction!: string;

  @ApiProperty({ format: "date-time", description: "Date de l'opération, au format ISO 8601." })
  @IsDateString({}, { message: "Date invalide (format AAAA-MM-JJ attendu)." })
  dateTransaction!: string;

  @ApiPropertyOptional({ maxLength: 200, description: "Nom de fichier justificatif si une pièce est transmise." })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 200, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  justificatifNom?: string;

  @ApiPropertyOptional({
    maxLength: 80,
    description:
      "Clé d'idempotence générée par l'interface. Deux soumissions identiques renvoient la même déclaration.",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(8, 80, {
    message: "La clé d'idempotence doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  cleIdempotence?: string;
}
