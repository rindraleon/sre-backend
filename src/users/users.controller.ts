import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UsersService } from "./users.service";

@Controller("utilisateurs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class UsersController {
  constructor(private readonly utilisateurs: UsersService) {}

  @Get()
  lister(
    @Query("recherche") recherche?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    return this.utilisateurs.lister(
      recherche,
      Number(page) || 1,
      Number(parPage) || 25,
    );
  }

  @Patch(":id/statut")
  modifierStatut(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: UpdateUserStatusDto,
    @CurrentUser() acteur: AuthenticatedUser,
  ) {
    return this.utilisateurs.modifierStatut(id, donnees.statut, acteur);
  }
}
