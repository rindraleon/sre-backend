import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";
import { ContactMessageSource } from "../../database/entities/contact-message.entity";

/** Formulaire public « Contact » du landing (sans authentification). */
export class PublicContactDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString({ message: "Saisissez votre nom." })
  @Length(2, 120, { message: "Le nom doit contenir entre 2 et 120 caractères." })
  nom!: string;

  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  @MaxLength(254, { message: "Adresse e-mail trop longue." })
  courriel!: string;

  @ApiProperty({ minLength: 3, maxLength: 140 })
  @IsString({ message: "Saisissez un sujet." })
  @Length(3, 140, { message: "Le sujet doit contenir entre 3 et 140 caractères." })
  sujet!: string;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString({ message: "Saisissez votre message." })
  @Length(10, 4000, { message: "Le message doit contenir entre 10 et 4 000 caractères." })
  message!: string;

  /** Anti-bot honeypot field: every legitimate form leaves it empty. */
  @ApiPropertyOptional({
    description: "Champ anti-robot masqué ; doit rester vide.",
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteWeb?: string;

  @ApiPropertyOptional({
    enum: ContactMessageSource,
    description: "Origine du message (site public ou espace client).",
  })
  @IsOptional()
  @IsIn([ContactMessageSource.PUBLIC_SITE, ContactMessageSource.CLIENT_PORTAL])
  source?: ContactMessageSource;
}

/** Formulaire de contact depuis l'espace client authentifié. */
export class ClientContactDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 })
  @IsOptional()
  @IsString()
  @Length(2, 120, { message: "Le nom doit contenir entre 2 et 120 caractères." })
  nom?: string;

  @ApiPropertyOptional({ format: "email", maxLength: 254 })
  @IsOptional()
  @IsEmail({}, { message: "Adresse e-mail invalide." })
  @MaxLength(254, { message: "Adresse e-mail trop longue." })
  courriel?: string;

  @ApiProperty({ minLength: 3, maxLength: 140 })
  @IsString({ message: "Saisissez un sujet." })
  @Length(3, 140, { message: "Le sujet doit contenir entre 3 et 140 caractères." })
  sujet!: string;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString({ message: "Saisissez votre message." })
  @Length(10, 4000, { message: "Le message doit contenir entre 10 et 4 000 caractères." })
  message!: string;
}
