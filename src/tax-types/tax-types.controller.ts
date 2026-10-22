import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AccountRole } from "../database/enums";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateTaxTypeDto } from "./dto/create-tax-type.dto";
import { TaxTypesService } from "./tax-types.service";

class TaxTypeActivityDto {
  @IsBoolean({ message: "Ce champ doit être un booléen." })
  actif!: boolean;
}

@ApiTags("Types d'impôts")
@ApiBearerAuth()
@Controller("types-impots")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxTypesController {
  constructor(private readonly taxTypesService: TaxTypesService) {}

  @Get()
  @ApiOperation({ summary: "Lister les types d'impôts actifs accessibles aux comptes authentifiés." })
  @ApiResponse({ status: 200, description: "Types d'impôts actifs." })
  listActive() {
    return this.taxTypesService.listActive();
  }

  @Get("tous")
  @ApiOperation({ summary: "Lister tous les types d'impôts, y compris inactifs (administration)." })
  @ApiResponse({ status: 200, description: "Liste des types actifs et inactifs." })
  @Roles(AccountRole.ADMIN)
  listAll() {
    return this.taxTypesService.listAll();
  }

  @Post()
  @ApiOperation({ summary: "Créer un type d'impôt configuré par l'administration." })
  @ApiResponse({ status: 201, description: "Type d'impôt créé." })
  @ApiResponse({ status: 400, description: "Données de configuration invalides." })
  @ApiResponse({ status: 409, description: "Code de type d'impôt déjà utilisé." })
  @Roles(AccountRole.ADMIN)
  create(@Body() data: CreateTaxTypeDto) {
    return this.taxTypesService.create(data);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Modifier la configuration d'un type d'impôt." })
  @ApiResponse({ status: 200, description: "Type d'impôt mis à jour." })
  @ApiResponse({ status: 400, description: "Configuration invalide." })
  @ApiResponse({ status: 404, description: "Type d'impôt introuvable." })
  @ApiResponse({ status: 409, description: "Code déjà attribué à un autre type." })
  @Roles(AccountRole.ADMIN)
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() data: CreateTaxTypeDto,
  ) {
    return this.taxTypesService.update(id, data);
  }

  @Patch(":id/activite")
  @ApiOperation({ summary: "Activer ou désactiver un type d'impôt sans effacer son historique." })
  @ApiResponse({ status: 200, description: "Statut du type d'impôt mis à jour." })
  @ApiResponse({ status: 400, description: "Valeur de statut invalide." })
  @ApiResponse({ status: 404, description: "Type d'impôt introuvable." })
  @Roles(AccountRole.ADMIN)
  setActive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() data: TaxTypeActivityDto,
  ) {
    return this.taxTypesService.setActive(id, data.actif);
  }
}
