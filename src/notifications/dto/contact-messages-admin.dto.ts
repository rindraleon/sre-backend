import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { ContactMessageStatus } from "../../database/entities/contact-message.entity";

export class ReplyContactMessageDto {
  @ApiPropertyOptional({
    description: "Objet personnalisé de la réponse (par défaut : Re: <sujet initial>).",
    minLength: 3,
    maxLength: 200,
  })
  @IsOptional()
  @IsString({ message: "L'objet de la réponse doit être une chaîne de caractères." })
  @Length(3, 200, {
    message: "L'objet de la réponse doit contenir entre 3 et 200 caractères.",
  })
  sujet?: string;

  @ApiProperty({
    description: "Contenu de la réponse envoyée par courriel à l'expéditeur.",
    minLength: 5,
    maxLength: 4000,
  })
  @IsString({ message: "Saisissez le contenu de votre réponse." })
  @Length(5, 4000, {
    message: "La réponse doit contenir entre 5 et 4 000 caractères.",
  })
  message!: string;
}

export class UpdateContactMessageStatusDto {
  @ApiProperty({
    enum: ContactMessageStatus,
    description: "Nouveau statut du message de contact.",
  })
  @IsEnum(ContactMessageStatus, {
    message:
      "Statut invalide. Valeurs acceptées : NON_LU, LU, EN_ATTENTE_REPONSE, REPONDU.",
  })
  statut!: ContactMessageStatus;
}

export type ContactEmailRetryType =
  | "NOTIFICATION_ADMIN"
  | "ACCUSE_VISITEUR"
  | "REPONSE"
  | "TOUS";

export class RetryContactEmailDto {
  @ApiPropertyOptional({
    enum: ["NOTIFICATION_ADMIN", "ACCUSE_VISITEUR", "REPONSE", "TOUS"],
    description: "Type d'envoi par courriel à relancer.",
  })
  @IsOptional()
  @IsIn(["NOTIFICATION_ADMIN", "ACCUSE_VISITEUR", "REPONSE", "TOUS"], {
    message: "Type de relance invalide.",
  })
  type?: ContactEmailRetryType;
}
