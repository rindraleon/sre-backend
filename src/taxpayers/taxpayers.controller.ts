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
  constructor(private readonly taxpayers: TaxpayersService) {}

  @Get("moi")
  @ApiOperation({ summary: "Consulter le profil contribuable lié à la session." })
  @ApiResponse({ status: 200, description: "Profil du titulaire du jeton." })
  @ApiResponse({ status: 404, description: "Aucun profil lié ou profil hors périmètre." })
  @Roles(AccountRole.CLIENT)
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.taxpayers.getMyProfile(user);
  }

  @Patch("moi")
  @ApiOperation({ summary: "Modifier les coordonnées autorisées du profil lié à la session." })
  @ApiResponse({ status: 200, description: "Profil mis à jour." })
  @ApiResponse({ status: 400, description: "Données de profil invalides." })
  @ApiResponse({ status: 404, description: "Profil lié introuvable." })
  @Roles(AccountRole.CLIENT)
  updateMyProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: UpdateTaxpayerProfileDto,
  ) {
    return this.taxpayers.updateMyProfile(user, data);
  }

  @Post("import")
  @ApiOperation({
    summary: "Importer jusqu'à 2 000 profils contribuables et créer les comptes des entreprises valides.",
    description:
      "Chaque ligne reçoit un état détaillé (compte créé, profil créé, doublon, rejetée avec ses erreurs). Pour chaque entreprise valide (raison sociale + e-mail + STAT), un compte distinct est créé (STAT = mot de passe provisoire haché) et un courriel d'activation est envoyé. L'import est idempotent : aucune création en double.",
  })
  @ApiResponse({
    status: 201,
    description:
      "Bilan détaillé : rapport ligne à ligne, comptes créés, doublons, rejets, statuts d'envoi des courriels.",
  })
  @ApiResponse({ status: 400, description: "Liste vide, trop volumineuse ou invalide." })
  @Roles(AccountRole.ADMIN)
  importTaxpayers(@Body() data: ImportTaxpayersDto) {
    return this.taxpayers.importTaxpayers(data.profils);
  }

  @Post()
  @ApiOperation({ summary: "Créer un dossier contribuable non lié à un compte utilisateur." })
  @ApiResponse({ status: 201, description: "Dossier enregistré dans Haute Matsiatra." })
  @ApiResponse({ status: 400, description: "Données de contribuable invalides." })
  @ApiResponse({ status: 409, description: "Courriel, NIF ou STAT déjà utilisé." })
  @Roles(AccountRole.ADMIN)
  createForAdministration(@Body() data: CreateTaxpayerDto) {
    return this.taxpayers.createForAdministration(data);
  }

  @Get()
  @ApiOperation({ summary: "Rechercher et paginer les dossiers de Haute Matsiatra." })
  @ApiQuery({ name: "recherche", required: false, description: "Nom, raison sociale, NIF ou courriel." })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "parPage", required: false, type: Number, example: 25, description: "Maximum 100 lignes par page." })
  @ApiResponse({ status: 200, description: "Page des profils correspondant au filtre." })
  @Roles(AccountRole.ADMIN)
  list(
    @Query("recherche") search?: string,
    @Query("page") page?: string,
    @Query("parPage") perPage?: string,
  ) {
    return this.taxpayers.list(
      search,
      Number(page) || 1,
      Number(perPage) || 25,
    );
  }

  @Delete(":id")
  @ApiOperation({ summary: "Supprimer un dossier isolé, sans historique ni compte lié." })
  @ApiResponse({ status: 200, description: "Dossier supprimé après contrôles serveur." })
  @ApiResponse({ status: 404, description: "Dossier introuvable." })
  @ApiResponse({ status: 409, description: "Compte lié ou historique fiscal empêchant la suppression." })
  @Roles(AccountRole.ADMIN)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.taxpayers.remove(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Consulter un dossier contribuable dans le périmètre du service." })
  @ApiResponse({ status: 200, description: "Profil et statut de compte associé, le cas échéant." })
  @ApiResponse({ status: 404, description: "Dossier absent ou hors Haute Matsiatra." })
  @Roles(AccountRole.ADMIN)
  getOne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.taxpayers.getOne(id);
  }
}
