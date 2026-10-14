import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { UtilisateurCourant } from "../commun/decorateurs/utilisateur-courant.decorateur";
import { JwtAuthGuard } from "../commun/guards/jwt-auth.guard";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { AuthentificationService } from "./authentification.service";
import { ChangerMotDePasseDto } from "./dto/changer-mot-de-passe.dto";
import { ConnexionDto } from "./dto/connexion.dto";
import { InscriptionDto } from "./dto/profil-inscription.dto";

@Controller("auth")
export class AuthentificationController {
  constructor(private readonly authentification: AuthentificationService) {}

  @Get("etat-inscription")
  etatInscription() {
    return this.authentification.obtenirEtatInscription();
  }

  @Post("inscription")
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  inscrire(@Body() donnees: InscriptionDto) {
    return this.authentification.inscrire(donnees);
  }

  @Post("connexion")
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  connecter(@Body() donnees: ConnexionDto) {
    return this.authentification.connecter(donnees);
  }

  @Get("moi")
  @UseGuards(JwtAuthGuard)
  moi(@UtilisateurCourant() utilisateur: UtilisateurAuthentifie) {
    return this.authentification.obtenirMonCompte(utilisateur.id);
  }

  @Patch("mot-de-passe")
  @UseGuards(JwtAuthGuard)
  changerMotDePasse(
    @UtilisateurCourant() utilisateur: UtilisateurAuthentifie,
    @Body() donnees: ChangerMotDePasseDto,
  ) {
    return this.authentification.changerMotDePasse(utilisateur.id, donnees);
  }
}
