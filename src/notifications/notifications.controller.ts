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
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listForUser(user.id);
  }

  @Get("non-lues")
  @ApiOperation({ summary: "Compter les notifications non lues du compte authentifié." })
  @ApiResponse({ status: 200, description: "Compteur du seul compte connecté." })
  countUnread(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.countUnread(user.id);
  }

  // Declared before `:id` so it is not captured as an identifier.
  @Patch("toutes-lues")
  @ApiOperation({ summary: "Marquer comme lues les notifications du compte authentifié." })
  @ApiResponse({ status: 200, description: "Notifications propres au compte mises à jour." })
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllAsRead(user.id);
  }

  @Patch(":id/lue")
  @ApiOperation({ summary: "Marquer comme lue une notification du compte authentifié." })
  @ApiResponse({ status: 200, description: "Notification marquée comme lue." })
  @ApiResponse({ status: 404, description: "Notification absente ou appartenant à un autre compte." })
  markAsRead(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notifications.markAsRead(id, user.id);
  }
}
