import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RoleCompte, StatutPaiement } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { CreerPaiementDto } from "./dto/creer-paiement.dto";
import { DecisionPaiementDto } from "./dto/decision-paiement.dto";
import { PaiementsService } from "./paiements.service";

@Controller("paiements")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaiementsController {
  constructor(private readonly paiements: PaiementsService) {}

  @Post()
  @RolesAutorises(RoleCompte.CLIENT)
  creerDeclaration(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
    @Body() donnees: CreerPaiementDto,
  ) {
    return this.paiements.creerDeclaration(utilisateur, donnees);
  }

  @Get("miennes")
  @RolesAutorises(RoleCompte.CLIENT)
  listerMesPaiements(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.paiements.listerMesPaiements(utilisateur);
  }

  @Get()
  @RolesAutorises(RoleCompte.ADMIN)
  listerPourAdministration(
    @Query("statut") statut?: string,
    @Query("page") page?: string,
    @Query("parPage") parPage?: string,
  ) {
    let statutFiltre: StatutPaiement | undefined;
    if (statut) {
      if (!Object.values(StatutPaiement).includes(statut as StatutPaiement)) {
        throw new BadRequestException("Filtre de statut invalide.");
      }
      statutFiltre = statut as StatutPaiement;
    }
    return this.paiements.listerPourAdministration(
      statutFiltre,
      Number(page) || 1,
      Number(parPage) || 25,
    );
  }

  @Patch(":id/decision")
  @RolesAutorises(RoleCompte.ADMIN)
  decider(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
    @Body() donnees: DecisionPaiementDto,
  ) {
    return this.paiements.decider(id, utilisateur, donnees);
  }

  @Get(":id")
  obtenirUne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.paiements.obtenirUne(id, utilisateur);
  }
}
