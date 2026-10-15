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
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationDto } from "./dto/registration.dto";

@ApiTags("Authentification")
@Controller("auth")
export class AuthController {
  constructor(private readonly authentification: AuthService) {}

  @Get("etat-inscription")
  @ApiOperation({ summary: "Consulter l'état d'initialisation du premier administrateur." })
  @ApiResponse({ status: 200, description: "Indique si un compte administrateur existe déjà." })
  etatInscription() {
    return this.authentification.obtenirEtatInscription();
  }

  @Post("inscription")
  @ApiOperation({
    summary: "Créer le premier compte administrateur ou un compte contribuable.",
    description: "Le rôle initial est attribué par le serveur; les inscriptions suivantes créent des comptes clients.",
  })
  @ApiResponse({ status: 201, description: "Compte créé et session authentifiée." })
  @ApiResponse({ status: 400, description: "Profil ou données d'inscription invalides." })
  @ApiResponse({ status: 409, description: "Courriel, NIF ou STAT déjà utilisé." })
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  inscrire(@Body() donnees: RegistrationDto) {
    return this.authentification.inscrire(donnees);
  }

  @Post("connexion")
  @ApiOperation({ summary: "Authentifier un compte et obtenir un jeton Bearer." })
  @ApiResponse({ status: 200, description: "Jeton et compte authentifié." })
  @ApiResponse({ status: 401, description: "Identifiants incorrects ou compte non actif." })
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  connecter(@Body() donnees: LoginDto) {
    return this.authentification.connecter(donnees);
  }

  @Get("moi")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Consulter le compte associé au jeton courant." })
  @ApiResponse({ status: 200, description: "Profil de l'utilisateur authentifié." })
  @ApiResponse({ status: 401, description: "Jeton absent, expiré ou compte inactif." })
  @UseGuards(JwtAuthGuard)
  moi(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.authentification.obtenirMonCompte(utilisateur.id);
  }

  @Patch("mot-de-passe")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Modifier le mot de passe de la session authentifiée." })
  @ApiResponse({ status: 200, description: "Mot de passe modifié." })
  @ApiResponse({ status: 400, description: "Mot de passe courant ou nouveau mot de passe invalide." })
  @ApiResponse({ status: 401, description: "Jeton absent, expiré ou mot de passe courant incorrect." })
  @UseGuards(JwtAuthGuard)
  changerMotDePasse(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: ChangePasswordDto,
  ) {
    return this.authentification.changerMotDePasse(utilisateur.id, donnees);
  }
}
