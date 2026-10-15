import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CreateTaxpayerDto } from "./dto/create-taxpayer.dto";
import { ImportTaxpayersDto } from "./dto/import-taxpayers.dto";
import { UpdateTaxpayerProfileDto } from "./dto/update-taxpayer-profile.dto";
import { TaxpayersService } from "./taxpayers.service";

@ApiTags("Contribuables")
@ApiBearerAuth()
@Controller("contribuables")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxpayersController {
  constructor(private readonly contribuables: TaxpayersService) {}

  @Get("moi")
  @ApiOperation({ summary: "Consulter le profil contribuable lié à la session." })
  @ApiResponse({ status: 200, description: "Profil du titulaire du jeton." })
  @ApiResponse({ status: 404, description: "Aucun profil lié ou profil hors périmètre." })
  @Roles(AccountRole.CLIENT)
  obtenirMonProfil(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.contribuables.obtenirMonProfil(utilisateur);
  }

  @Patch("moi")
  @ApiOperation({ summary: "Modifier les coordonnées autorisées du profil lié à la session." })
  @ApiResponse({ status: 200, description: "Profil mis à jour." })
  @ApiResponse({ status: 400, description: "Données de profil invalides." })
  @ApiResponse({ status: 404, description: "Profil lié introuvable." })
  @Roles(AccountRole.CLIENT)
  modifierMonProfil(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: UpdateTaxpayerProfileDto,
  ) {
    return this.contribuables.modifierMonProfil(utilisateur, donnees);
  }

  @Post("import")
  @ApiOperation({ summary: "Importer jusqu'à 2 000 profils contribuables, sans créer de comptes." })
  @ApiResponse({ status: 201, description: "Bilan serveur des profils créés et ignorés." })
  @ApiResponse({ status: 400, description: "Liste vide, trop volumineuse ou invalide." })
  @Roles(AccountRole.ADMIN)
  importer(@Body() donnees: ImportTaxpayersDto) {
    return this.contribuables.importer(donnees.profils);
  }

  @Post()
  @ApiOperation({ summary: "Créer un dossier contribuable non lié à un compte utilisateur." })
  @ApiResponse({ status: 201, description: "Dossier enregistré dans Haute Matsiatra." })
  @ApiResponse({ status: 400, description: "Données de contribuable invalides." })
  @ApiResponse({ status: 409, description: "Courriel, NIF ou STAT déjà utilisé." })
  @Roles(AccountRole.ADMIN)
  creerPourAdministration(@Body() donnees: CreateTaxpayerDto) {
    return this.contribuables.creerPourAdministration(donnees);
  }

  @Get()
  @ApiOperation({ summary: "Rechercher et paginer les dossiers de Haute Matsiatra." })
  @ApiQuery({ name: "recherche", required: false, description: "Nom, raison sociale, NIF ou courriel." })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "parPage", required: false, type: Number, example: 25, description: "Maximum 100 lignes par page." })
  @ApiResponse({ status: 200, description: "Page des profils correspondant au filtre." })
  @Roles(AccountRole.ADMIN)
  lister(
    @Query("recherche") recherche?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    return this.contribuables.lister(
      recherche,
      Number(page) || 1,
      Number(parPage) || 25,
    );
  }

  @Delete(":id")
  @ApiOperation({ summary: "Supprimer un dossier isolé, sans historique ni compte lié." })
  @ApiResponse({ status: 200, description: "Dossier supprimé après contrôles serveur." })
  @ApiResponse({ status: 404, description: "Dossier introuvable." })
  @ApiResponse({ status: 409, description: "Compte lié ou historique fiscal empêchant la suppression." })
  @Roles(AccountRole.ADMIN)
  supprimer(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.supprimer(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter un dossier contribuable dans le périmètre du service." })
  @ApiResponse({ status: 200, description: "Profil et statut de compte associé, le cas échéant." })
  @ApiResponse({ status: 404, description: "Dossier absent ou hors Haute Matsiatra." })
  @Roles(AccountRole.ADMIN)
  obtenirUne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.obtenirUne(id);
  }
}
