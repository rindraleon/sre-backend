import { IsArray, IsOptional, IsString, Length, ArrayMaxSize, ArrayMinSize, IsUUID } from "class-validator";

export class NotificationCampaignDto {
  @IsArray({ message: "La liste des dossiers est requise." })
  @ArrayMinSize(1, { message: "Sélectionnez au moins un dossier." })
  @ArrayMaxSize(200, {
    message: "Une campagne ne peut pas dépasser 200 destinataires.",
  })
  @IsUUID("4", { each: true, message: "Identifiant de dossier invalide." })
  obligationIds!: string[];

  @IsOptional()
  @IsString({ message: "Ce champ doit être une chaîne de caractères." })
  @Length(1, 160, {
    message: "Ce champ doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  titre?: string;

  @IsString({ message: "Le message est requis." })
  @Length(10, 2000, {
    message: "Le message doit contenir entre $constraint1 et $constraint2 caractères.",
  })
  message!: string;
}
