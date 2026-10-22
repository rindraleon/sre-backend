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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { ActivationService } from "../notifications/activation.service";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UsersService } from "./users.service";

@ApiTags("Utilisateurs")
@ApiBearerAuth()
@Controller("utilisateurs")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly activation: ActivationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Lister les comptes visibles pour l'administration du périmètre." })
  @ApiQuery({ name: "recherche", required: false, description: "Nom, courriel ou NIF." })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "parPage", required: false, type: Number, example: 25, description: "Maximum 100 comptes par page." })
  @ApiResponse({ status: 200, description: "Page de comptes sans mot de passe ni secret." })
  list(
    @Query("recherche") search?: string,
    @Query("page") page?: string,
    @Query("parPage") perPage?: string,
  ) {
    return this.users.list(
      search,
      Number(page) || 1,
      Number(perPage) || 25,
    );
  }

  @Get("emails-activation")
  @ApiOperation({
    summary: "Lister les courriels de première connexion avec leur statut d'envoi.",
  })
  @ApiResponse({ status: 200, description: "Courriels d'activation (statut, tentatives, erreur)." })
  listActivationEmails() {
    return this.activation.listRequests();
  }

  @Post("emails-activation/:id/renvoyer")
  @ApiOperation({
    summary: "Réessayer l'envoi d'un courriel de première connexion en échec.",
    description:
      "Un nouveau jeton d'activation à usage unique est émis dans le courriel renvoyé (le précédent est invalidé).",
  })
  @ApiResponse({ status: 201, description: "Courriel renvoyé, statut mis à jour." })
  @ApiResponse({ status: 404, description: "Courriel d'activation introuvable." })
  @HttpCode(HttpStatus.CREATED)
  resendEmailActivation(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.activation.resend(id);
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
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() data: UpdateUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateStatus(id, data.statut, actor);
  }
}
