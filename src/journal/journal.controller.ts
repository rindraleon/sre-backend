import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { JournalService } from "./journal.service";

/**
 * Administration : journal d'activité (audit des actions métier).
 * Les lignes sont produites par l'intercepteur global `JournalActiviteInterceptor`.
 */
@ApiTags("Administration — journal d’activité")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AccountRole.ADMIN)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Get("journal-activite")
  @ApiOperation({
    summary: "Consulter le journal d’activité (audit).",
    description:
      "Actions réalisées par les comptes authentifiés : acteur, rôle, action, ressource, référence, résultat et date.",
  })
  @ApiParam({ name: "parPage", required: false, description: "Nombre de lignes (1 à 500, défaut 200)." })
  @ApiResponse({ status: 200, description: "Événements d’audit, du plus récent au plus ancien." })
  @ApiResponse({ status: 403, description: "Réservé aux administrateurs." })
  lister(@Query("parPage") parPage?: string) {
    return this.journal.lister(parPage);
  }
}
