import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CampaignService } from "./campaign.service";
import { NotificationCampaignDto } from "./dto/notification-campaign.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";

/**
 * Administration: overdue tracking and bulk notification campaigns.
 * Restricted to administrator accounts; every operation is validated
 * server-side and traced (author, recipients, delivery statuses).
 */
@ApiTags("Administration — retards et notifications")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class NotificationsAdminController {
  constructor(
    private readonly campaigns: CampaignService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @Get("retards")
  @ApiOperation({
    summary: "Lister les dossiers en retard ou en traitement particulier.",
    description:
      "Calculés depuis les dates d'échéance et les statuts enregistrés. Les dossiers régularisés sont exclus par défaut (inclureRegularises=true pour les afficher).",
  })
  @ApiResponse({ status: 200, description: "Lignes de suivi des retards." })
  listOverdue(
    @Query("recherche") search?: string,
    @Query("situation") situation?: string,
    @Query("type") type?: string,
    @Query("inclureRegularises") includeSettled?: string,
  ) {
    return this.campaigns.listOverdue({
      search,
      situation,
      type,
      includeSettled:
        includeSettled === "true" || includeSettled === "1",
    });
  }

  @Post("notifications/groupes")
  @ApiOperation({
    summary: "Envoyer une notification à plusieurs entités sélectionnées.",
    description:
      "Les dossiers régularisés sont exclus ; les doublons du même jour sont ignorés ; chaque destinataire reçoit son propre rendu du modèle. Le récapitulatif distingue les envois, les doublons et les échecs partiels.",
  })
  @ApiResponse({ status: 201, description: "Récapitulatif de la campagne." })
  @HttpCode(HttpStatus.CREATED)
  async sendCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: NotificationCampaignDto,
  ) {
    const administrator = await this.users.findOneByOrFail({
      id: user.id,
    });
    return this.campaigns.sendCampaign(
      administrator,
      data.obligationIds,
      data.message,
      data.titre,
    );
  }

  @Get("notifications/historique-envois")
  @ApiOperation({
    summary: "Historique des campagnes de notifications de retard.",
    description:
      "Destinataire, dossier, message, date, administrateur à l'origine de l'action et statut d'envoi.",
  })
  @ApiResponse({ status: 200, description: "Historique des envois groupés." })
  dispatchHistory() {
    return this.campaigns.dispatchHistory();
  }
}
