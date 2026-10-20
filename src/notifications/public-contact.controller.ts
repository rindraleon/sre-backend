import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { PublicContactDto } from "./dto/public-contact.dto";
import { PublicContactService } from "./public-contact.service";

/** Formulaire public du landing : aucune authentification requise. */
@ApiTags("Contact public")
@Controller("contact")
export class PublicContactController {
  constructor(private readonly contact: PublicContactService) {}

  @Post()
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Transmettre un message du formulaire public aux administrateurs actifs.",
    description:
      "Le destinataire est résolu côté serveur ; envoi limité à 5 tentatives par minute et par client. Le courriel de l'expéditeur est défini en Reply-To. Aucune adresse administrative n'est exposée au navigateur.",
  })
  @ApiResponse({ status: 201, description: "Message transmis (ou capturé en mode test)." })
  @ApiResponse({ status: 400, description: "Données de contact invalides." })
  @ApiResponse({ status: 429, description: "Trop de messages envoyés ; réessayez plus tard." })
  @ApiResponse({ status: 503, description: "Le service de courriel est indisponible." })
  envoyer(@Body() donnees: PublicContactDto) {
    return this.contact.envoyer(donnees);
  }
}
