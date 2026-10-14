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
import { RoleCompte } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { ModifierStatutUtilisateurDto } from "./dto/modifier-statut-utilisateur.dto";
import { UtilisateursService } from "./utilisateurs.service";

@Controller("utilisateurs")
@UseGuards(JwtAuthGuard, RolesGuard)
@RolesAutorises(RoleCompte.ADMIN)
export class UtilisateursController {
  constructor(private readonly utilisateurs: UtilisateursService) {}

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
    @Body() donnees: ModifierStatutUtilisateurDto,
    @UtilisateurCourant() acteur: UtilisateurAuthentifie,
  ) {
    return this.utilisateurs.modifierStatut(id, donnees.statut, acteur);
  }
}
