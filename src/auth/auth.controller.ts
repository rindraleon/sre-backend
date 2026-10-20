import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ConfigurationLibre } from "../common/decorators/configuration-libre.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuthService } from "./auth.service";
import { ActivationConfirmationDto } from "./dto/activation-confirmation.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ConfigurationInitialeDto } from "./dto/configuration-initiale.dto";
import { LoginDto } from "./dto/login.dto";
import {
  MotDePasseOublieDto,
  ReinitialisationMotDePasseDto,
} from "./dto/password-reset.dto";
import { RegistrationDto } from "./dto/registration.dto";
import {
  DemanderVerificationCourrielDto,
  VerifierCourrielDto,
} from "./dto/verification-courriel.dto";

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
    description:
      "Le rôle initial est attribué par le serveur : un seul processus de création initiale est autorisé. Les inscriptions suivantes créent des comptes clients ; aucune seconde création d'administrateur initial n'est possible.",
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
  @ApiOperation({
    summary: "Authentifier un compte et obtenir un jeton Bearer.",
    description:
      "Identification par l'adresse e-mail et le mot de passe uniquement. Première connexion d'un compte créé par import : le mot de passe provisoire est le numéro STAT transmis ; la configuration initiale (nouveau mot de passe + profil) est alors obligatoire. Le champ `stat` est ignoré (conservé pour compatibilité).",
  })
  @ApiResponse({ status: 200, description: "Jeton et compte authentifié." })
  @ApiResponse({
    status: 401,
    description:
      "Compte introuvable, compte non activé ou mot de passe incorrect (messages distincts).",
  })
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  connecter(@Body() donnees: LoginDto, @Req() requete: Request) {
    return this.authentification.connecter(
      donnees,
      requete.ip ?? requete.socket?.remoteAddress ?? null,
    );
  }

  @Post("configuration-initiale")
  @ConfigurationLibre()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Configuration initiale : mot de passe provisoire → mot de passe personnel + profil.",
    description:
      "Obligatoire après une première connexion avec le mot de passe provisoire (numéro STAT). Invalide définitivement le mot de passe provisoire et débloque l'espace.",
  })
  @ApiResponse({ status: 201, description: "Configuration terminée, espace débloqué." })
  @ApiResponse({ status: 400, description: "Mot de passe actuel incorrect ou configuration déjà terminée." })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  configurerPremiereConnexion(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: ConfigurationInitialeDto,
  ) {
    return this.authentification.configurerPremiereConnexion(
      utilisateur.id,
      donnees,
    );
  }

  @Get("activation/:jeton")
  @ApiOperation({
    summary: "Consulter un lien d'activation à usage unique (avant confirmation).",
    description:
      "Parcours sécurisé de première activation : le lien envoyé par courriel permet de définir directement le mot de passe personnel.",
  })
  @ApiResponse({ status: 200, description: "Jeton valide (destinataire masqué, libellé de l'entité)." })
  @ApiResponse({ status: 404, description: "Lien invalide, déjà utilisé ou expiré." })
  @Throttle({ global: { limit: 12, ttl: 60_000 } })
  consulterActivation(@Param("jeton") jeton: string) {
    return this.authentification.consulterActivation(jeton);
  }

  @Post("activation/confirmer")
  @ApiOperation({
    summary: "Confirmer une activation : définir le mot de passe personnel et valider le profil.",
    description:
      "Le jeton est à usage unique et à expiration contrôlée ; le mot de passe provisoire est invalidé.",
  })
  @ApiResponse({ status: 201, description: "Espace activé." })
  @ApiResponse({ status: 404, description: "Lien invalide, déjà utilisé ou expiré." })
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  confirmerActivation(@Body() donnees: ActivationConfirmationDto) {
    return this.authentification.confirmerActivation(donnees.jeton, donnees);
  }

  @Post("mot-de-passe-oublie")
  @ApiOperation({
    summary: "Demander un lien sécurisé de réinitialisation du mot de passe.",
    description:
      "Réponse identique que le compte existe ou non (aucune énumération). Lien à usage unique, valable 24 heures.",
  })
  @ApiResponse({ status: 201, description: "Demande traitée (réponse générique)." })
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  demanderReinitialisation(@Body() donnees: MotDePasseOublieDto) {
    return this.authentification.demanderReinitialisation(donnees.courriel);
  }

  @Post("reinitialisation-mot-de-passe")
  @ApiOperation({ summary: "Réinitialiser le mot de passe via le jeton à usage unique." })
  @ApiResponse({ status: 201, description: "Mot de passe réinitialisé." })
  @ApiResponse({ status: 404, description: "Jeton invalide, déjà utilisé ou expiré." })
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  reinitialiserMotDePasse(@Body() donnees: ReinitialisationMotDePasseDto) {
    return this.authentification.reinitialiserMotDePasse(
      donnees.jeton,
      donnees.nouveauMotDePasse,
    );
  }

  @Post("verification-courriel")
  @ApiOperation({
    summary: "Demander l'envoi d'un code de vérification d'adresse e-mail.",
    description:
      "Réponse identique que le compte existe ou non. Sans transport de courriel configuré, aucun envoi n'est annoncé.",
  })
  @ApiResponse({ status: 201, description: "Demande traitée (réponse générique)." })
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  demanderVerificationCourriel(@Body() donnees: DemanderVerificationCourrielDto) {
    return this.authentification.demanderVerificationCourriel(donnees.courriel);
  }

  @Post("verification-courriel/confirmer")
  @ApiOperation({ summary: "Valider le code à usage unique reçu par courriel." })
  @ApiResponse({ status: 201, description: "Adresse e-mail vérifiée." })
  @ApiResponse({ status: 400, description: "Code invalide ou expiré." })
  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  verifierCourriel(@Body() donnees: VerifierCourrielDto) {
    return this.authentification.verifierCourriel(donnees.courriel, donnees.code);
  }

  @Get("moi")
  @ConfigurationLibre()
  @ApiBearerAuth()
  @ApiOperation({ summary: "Consulter le compte associé au jeton courant." })
  @ApiResponse({ status: 200, description: "Profil de l'utilisateur authentifié." })
  @ApiResponse({ status: 401, description: "Jeton absent, expiré ou compte inactif." })
  @UseGuards(JwtAuthGuard)
  moi(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.authentification.obtenirMonCompte(utilisateur.id);
  }

  @Patch("mot-de-passe")
  @ConfigurationLibre()
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
