import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AccountRole } from "../database/enums";
import {
  ReplyContactMessageDto,
  RetryContactEmailDto,
  UpdateContactMessageStatusDto,
} from "./dto/contact-messages-admin.dto";
import { PublicContactService } from "./public-contact.service";

/** Administration: contact messages received from visitors and clients. */
@ApiTags("Administration — messagerie de contact")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class ContactMessagesAdminController {
  constructor(private readonly contact: PublicContactService) {}

  @Get("messages-contact/non-lus")
  @ApiOperation({
    summary:
      "Compter les messages de contact non lus et obtenir la répartition par statut.",
  })
  @ApiResponse({
    status: 200,
    description: "Compteurs de messages non lus et par statut.",
  })
  getUnreadCounts() {
    return this.contact.getUnreadCounts();
  }

  @Get("messages-contact")
  @ApiOperation({
    summary:
      "Lister, rechercher, filtrer et trier les messages de contact reçus.",
    description:
      "Chaque message est conservé dans le portail avec son statut (NON_LU, LU, EN_ATTENTE_REPONSE, REPONDU), le statut de la notification admin, de l'accusé de réception et de la réponse.",
  })
  @ApiResponse({ status: 200, description: "Liste des messages de contact." })
  list(
    @Query("nonLus") unreadOnly?: string,
    @Query("statut") status?: string,
    @Query("statutCourriel") emailStatus?: string,
    @Query("source") source?: string,
    @Query("recherche") search?: string,
    @Query("tri") sort?: string,
    @Query("limite") limit?: string,
  ) {
    return this.contact.listForAdministration({
      unreadOnly: unreadOnly === "true" || unreadOnly === "1",
      status,
      emailStatus,
      source,
      search,
      sort,
      limit: Number(limit) || 100,
    });
  }

  @Get("messages-contact/:id")
  @ApiOperation({
    summary:
      "Consulter le contenu complet d'un message de contact et le marquer comme lu.",
  })
  @ApiResponse({ status: 200, description: "Détail complet du message." })
  @ApiResponse({ status: 404, description: "Message introuvable." })
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query("nePasMarquerLu") doNotMarkRead?: string,
  ) {
    return this.contact.getOneForAdministration(
      id,
      doNotMarkRead !== "true" && doNotMarkRead !== "1",
    );
  }

  @Patch("messages-contact/:id/lire")
  @ApiOperation({
    summary: "Marquer un message de contact comme lu.",
  })
  @ApiResponse({ status: 200, description: "Message marqué comme lu." })
  markAsRead(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contact.markAsRead(id);
  }

  @Patch("messages-contact/:id/statut")
  @ApiOperation({
    summary:
      "Mettre à jour le statut d'un message de contact (NON_LU, LU, EN_ATTENTE_REPONSE, REPONDU).",
  })
  @ApiResponse({ status: 200, description: "Statut du message mis à jour." })
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() data: UpdateContactMessageStatusDto,
  ) {
    return this.contact.updateStatus(id, data.statut);
  }

  @Post("messages-contact/:id/repondre")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Répondre directement à un message de contact par e-mail et enregistrer la réponse.",
  })
  @ApiResponse({
    status: 200,
    description:
      "Réponse enregistrée et envoyée (ou erreur d'envoi tracée avec possibilité de relance).",
  })
  reply(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: ReplyContactMessageDto,
  ) {
    return this.contact.replyToMessage(id, user, data);
  }

  @Post("messages-contact/:id/renvoyer-courriel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Réessayer l'envoi des courriels en échec associés à un message de contact.",
  })
  @ApiResponse({
    status: 200,
    description: "Tentative de renvoi effectuée et statuts mis à jour.",
  })
  retryEmails(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: RetryContactEmailDto,
  ) {
    return this.contact.retryMessageEmails(id, user, data?.type ?? "TOUS");
  }
}
