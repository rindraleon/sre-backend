import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { RoleCompte } from "../base-de-donnees/enums";
import { RolesAutorises } from "../commun/decorateurs/roles.decorateur";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { RolesGuard } from "../commun/guards/roles.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { CreerObligationDto } from "./dto/creer-obligation.dto";
import { ObligationsService } from "./obligations.service";

@Controller("obligations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ObligationsController {
  constructor(private readonly obligations: ObligationsService) {}

  @Get("miennes")
  @RolesAutorises(RoleCompte.CLIENT)
  listerMesObligations(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.obligations.listerPourClient(utilisateur.contribuableId ?? "");
  }

  @Get()
  @RolesAutorises(RoleCompte.ADMIN)
  listerToutes() {
    return this.obligations.listerPourAdministration();
  }

  @Post()
  @RolesAutorises(RoleCompte.ADMIN)
  creer(@Body() donnees: CreerObligationDto) {
    return this.obligations.creer(donnees);
  }

  @Get(":id")
  obtenirUne(
    @Param("id", new ParseUUIDPipe()) id: string,
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
  ) {
    return this.obligations.obtenirUne(id, utilisateur);
  }
}
