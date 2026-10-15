import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@ApiBearerAuth()
@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN, AccountRole.CLIENT)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "Lister les notifications du compte authentifié." })
  @ApiResponse({ status: 200, description: "Notifications filtrées par l'utilisateur du jeton." })
  lister(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.listerPourUtilisateur(utilisateur.id);
  }

  @Get("non-lues")
  @ApiOperation({ summary: "Compter les notifications non lues du compte authentifié." })
  @ApiResponse({ status: 200, description: "Compteur du seul compte connecté." })
  compterNonLues(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.compterNonLues(utilisateur.id);
  }

  // Déclarée avant `:id` pour ne pas être capturée comme un identifiant.
  @Patch("toutes-lues")
  @ApiOperation({ summary: "Marquer comme lues les notifications du compte authentifié." })
  @ApiResponse({ status: 200, description: "Notifications propres au compte mises à jour." })
  marquerToutesLues(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.marquerToutesLues(utilisateur.id);
  }

  @Patch(":id/lue")
  @ApiOperation({ summary: "Marquer comme lue une notification du compte authentifié." })
  @ApiResponse({ status: 200, description: "Notification marquée comme lue." })
  @ApiResponse({ status: 404, description: "Notification absente ou appartenant à un autre compte." })
  marquerLue(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.notifications.marquerLue(id, utilisateur.id);
  }
}
