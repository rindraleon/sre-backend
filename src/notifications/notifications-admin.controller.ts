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
import { CampagneNotificationDto } from "./dto/campagne-notification.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";

/**
 * Administration : suivi des retards et campagnes de notifications groupées.
 * Réservé aux comptes administrateurs ; toutes les opérations sont validées
 * côté serveur et tracées (auteur, destinataires, statuts d'envoi).
 */
@ApiTags("Administration — retards et notifications")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class NotificationsAdminController {
  constructor(
    private readonly campagnes: CampaignService,
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
  ) {}

  @Get("retards")
  @ApiOperation({
    summary: "Lister les dossiers en retard ou en traitement particulier.",
    description:
      "Calculés depuis les dates d'échéance et les statuts enregistrés. Les dossiers régularisés sont exclus par défaut (inclureRegularises=true pour les afficher).",
  })
  @ApiResponse({ status: 200, description: "Lignes de suivi des retards." })
  listerRetards(
    @Query("recherche") recherche?: string,
    @Query("situation") situation?: string,
    @Query("type") type?: string,
    @Query("inclureRegularises") inclureRegularises?: string,
  ) {
    return this.campagnes.listerRetards({
      recherche,
      situation,
      type,
      inclureRegularises:
        inclureRegularises === "true" || inclureRegularises === "1",
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
  async envoyerCampagne(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: CampagneNotificationDto,
  ) {
    const administrateur = await this.utilisateurs.findOneByOrFail({
      id: utilisateur.id,
    });
    return this.campagnes.envoyerCampagne(
      administrateur,
      donnees.obligationIds,
      donnees.message,
      donnees.titre,
    );
  }

  @Get("notifications/historique-envois")
  @ApiOperation({
    summary: "Historique des campagnes de notifications de retard.",
    description:
      "Destinataire, dossier, message, date, administrateur à l'origine de l'action et statut d'envoi.",
  })
  @ApiResponse({ status: 200, description: "Historique des envois groupés." })
  historiqueEnvois() {
    return this.campagnes.historiqueEnvois();
  }
}
