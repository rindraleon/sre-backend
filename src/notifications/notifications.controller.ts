import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN, AccountRole.CLIENT)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  lister(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.listerPourUtilisateur(utilisateur.id);
  }

  @Get("non-lues")
  compterNonLues(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.compterNonLues(utilisateur.id);
  }

  // Déclarée avant `:id` pour ne pas être capturée comme un identifiant.
  @Patch("toutes-lues")
  marquerToutesLues(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.notifications.marquerToutesLues(utilisateur.id);
  }

  @Patch(":id/lue")
  marquerLue(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() utilisateur: AuthenticatedUser,
  ) {
    return this.notifications.marquerLue(id, utilisateur.id);
  }
}
