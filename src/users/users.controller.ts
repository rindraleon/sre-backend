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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UsersService } from "./users.service";

@ApiTags("Utilisateurs")
@ApiBearerAuth()
@Controller("utilisateurs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class UsersController {
  constructor(private readonly utilisateurs: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Lister les comptes visibles pour l'administration du périmètre." })
  @ApiQuery({ name: "recherche", required: false, description: "Nom, courriel ou NIF." })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "parPage", required: false, type: Number, example: 25, description: "Maximum 100 comptes par page." })
  @ApiResponse({ status: 200, description: "Page de comptes sans mot de passe ni secret." })
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
  @ApiOperation({
    summary: "Modifier le statut d'un compte.",
    description: "Les opérations sont sérialisées côté serveur afin de protéger le dernier administrateur actif.",
  })
  @ApiResponse({ status: 200, description: "Statut de compte mis à jour." })
  @ApiResponse({ status: 400, description: "Statut invalide ou tentative de désactiver son propre compte." })
  @ApiResponse({ status: 404, description: "Compte introuvable dans le périmètre." })
  @ApiResponse({ status: 409, description: "Le dernier administrateur actif ne peut pas être désactivé." })
  modifierStatut(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() donnees: UpdateUserStatusDto,
    @CurrentUser() acteur: AuthenticatedUser,
  ) {
    return this.utilisateurs.modifierStatut(id, donnees.statut, acteur);
  }
}
