import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Length, ValidateIf } from "class-validator";
import { PaymentMethod } from "../../database/enums";

export enum ProviderCallbackStatus {
  CONFIRMED = "CONFIRME",
  FAILED = "ECHEC",
}

/**
 * Notification envoyée par le mécanisme de paiement (opérateur mobile-money, banque,
 * service de rapprochement) une fois le sort de l'opération connu.
 *
 * La requête est authentifiée par une signature HMAC-SHA256 de son corps brut
 * (en-tête `x-sre-signature`), vérifiée avant tout traitement.
 */
export class PaymentProviderCallbackDto {
  @ApiPropertyOptional({
    maxLength: 48,
    description: "Référence interne du paiement (PAY-AAAA-XXXXXXXXXXXX).",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 48, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceInterne?: string;

  @ApiPropertyOptional({
    maxLength: 128,
    description: "Référence de l'opération déclarée par le contribuable.",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 128, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceTransaction?: string;

  @ApiProperty({
    enum: ProviderCallbackStatus,
    description: "CONFIRME génère le reçu ; ECHEC clôt le paiement sans reçu.",
  })
  @IsEnum(ProviderCallbackStatus, { message: "Statut de callback invalide." })
  statut!: ProviderCallbackStatus;

  @ApiPropertyOptional({ maxLength: 40, description: "Nom du prestataire." })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 40, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  fournisseur?: string;

  @ApiPropertyOptional({
    maxLength: 128,
    description: "Identifiant de la transaction chez le prestataire.",
  })
  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(2, 128, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  referenceFournisseur?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: "Motif d'échec fourni par le prestataire.",
  })
  @ValidateIf(
    (data: PaymentProviderCallbackDto) =>
      data.statut === ProviderCallbackStatus.FAILED,
  )
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(3, 500, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  motif?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description: "Canal réellement utilisé, à titre informatif.",
  })
  @IsOptional()
  @IsEnum(PaymentMethod, { message: "La valeur sélectionnée est invalide." })
  mode?: PaymentMethod;
}
