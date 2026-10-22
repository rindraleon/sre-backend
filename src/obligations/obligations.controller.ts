import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { CreateObligationDto } from "./dto/create-obligation.dto";
import { ObligationsService } from "./obligations.service";

@ApiTags("Obligations fiscales")
@ApiBearerAuth()
@Controller("obligations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get("miennes")
  @ApiOperation({ summary: "Lister les obligations fiscales du contribuable authentifié." })
  @ApiResponse({ status: 200, description: "Obligations et échéances liées au profil du compte." })
  @Roles(AccountRole.CLIENT)
  listMyObligations(@CurrentUser() user: AuthenticatedUser) {
    return this.obligations.listForClient(user.taxpayerId ?? "");
  }

  @Get()
  @ApiOperation({ summary: "Lister les obligations fiscales du périmètre Haute Matsiatra." })
  @ApiResponse({ status: 200, description: "Liste des obligations avec leur contribuable." })
  @Roles(AccountRole.ADMIN)
  listAll() {
    return this.obligations.listForAdministration();
  }

  @Post()
  @ApiOperation({ summary: "Créer une obligation fiscale pour un contribuable et un type d'impôt actif." })
  @ApiResponse({ status: 201, description: "Obligation créée avec un montant et une échéance transmis par l'administration." })
  @ApiResponse({ status: 400, description: "Données invalides ou type de contribuable non éligible." })
  @ApiResponse({ status: 404, description: "Contribuable ou type d'impôt actif introuvable." })
  @ApiResponse({ status: 409, description: "Référence d'obligation déjà utilisée." })
  @Roles(AccountRole.ADMIN)
  create(@Body() data: CreateObligationDto) {
    return this.obligations.create(data);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter une obligation accessible à la session." })
  @ApiResponse({ status: 200, description: "Détails de l'obligation." })
  @ApiResponse({ status: 403, description: "L'obligation ne correspond pas au contribuable connecté." })
  @ApiResponse({ status: 404, description: "Obligation introuvable." })
  getOne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.obligations.getOne(id, user);
  }
}
