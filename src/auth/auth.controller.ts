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
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationDto } from "./dto/registration.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authentification: AuthService) {}

  @Get("etat-inscription")
  etatInscription() {
    return this.authentification.obtenirEtatInscription();
  }

  @Post("inscription")
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  inscrire(@Body() donnees: RegistrationDto) {
    return this.authentification.inscrire(donnees);
  }

  @Post("connexion")
  @Throttle({ global: { limit: 8, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  connecter(@Body() donnees: LoginDto) {
    return this.authentification.connecter(donnees);
  }

  @Get("moi")
  @UseGuards(JwtAuthGuard)
  moi(@CurrentUser() utilisateur: AuthenticatedUser) {
    return this.authentification.obtenirMonCompte(utilisateur.id);
  }

  @Patch("mot-de-passe")
  @UseGuards(JwtAuthGuard)
  changerMotDePasse(
    @CurrentUser() utilisateur: AuthenticatedUser,
    @Body() donnees: ChangePasswordDto,
  ) {
    return this.authentification.changerMotDePasse(utilisateur.id, donnees);
  }
}
