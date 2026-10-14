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
import { RoleCompte } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { CreerContribuableDto } from "./dto/creer-contribuable.dto";
import { ImporterContribuablesDto } from "./dto/importer-contribuables.dto";
import { ModifierProfilContribuableDto } from "./dto/modifier-profil-contribuable.dto";
import { ContribuablesService } from "./contribuables.service";

@Controller("contribuables")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContribuablesController {
  constructor(private readonly contribuables: ContribuablesService) {}

  @Get("moi")
  @RolesAutorises(RoleCompte.CLIENT)
  obtenirMonProfil(@UtilisateurCourant() utilisateur: UtilisateurAuthentifie) {
    return this.contribuables.obtenirMonProfil(utilisateur);
  }

  @Patch("moi")
  @RolesAutorises(RoleCompte.CLIENT)
  modifierMonProfil(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
    @Body() donnees: ModifierProfilContribuableDto,
  ) {
    return this.contribuables.modifierMonProfil(utilisateur, donnees);
  }

  @Post("import")
  @RolesAutorises(RoleCompte.ADMIN)
  importer(@Body() donnees: ImporterContribuablesDto) {
    return this.contribuables.importer(donnees.profils);
  }

  @Post()
  @RolesAutorises(RoleCompte.ADMIN)
  creerPourAdministration(@Body() donnees: CreerContribuableDto) {
    return this.contribuables.creerPourAdministration(donnees);
  }

  @Get()
  @RolesAutorises(RoleCompte.ADMIN)
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
  @RolesAutorises(RoleCompte.ADMIN)
  supprimer(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.supprimer(id);
  }

  @Get(":id")
  @RolesAutorises(RoleCompte.ADMIN)
  obtenirUne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.contribuables.obtenirUne(id);
  }
}
