import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { AccountStatus, AccountRole } from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configuration: ConfigService,
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
  ) {
    const secret = configuration.getOrThrow<string>("JWT_SECRET").trim();
    if (secret.length < 32)
      throw new Error(
        "JWT_SECRET doit contenir au moins 32 caractères aléatoires.",
      );
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(
    charge: Pick<AuthenticatedUser, "id">,
  ): Promise<AuthenticatedUser> {
    if (!charge?.id) throw new UnauthorizedException("Jeton invalide.");
    const utilisateur = await this.utilisateurs.findOne({
      where: { id: charge.id },
      relations: { contribuable: true },
    });
    if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) {
      throw new UnauthorizedException("Compte inactif ou introuvable.");
    }
    if (
      utilisateur.role === AccountRole.CLIENT &&
      utilisateur.contribuable?.region !== SRE_REGION
    ) {
      throw new UnauthorizedException(
        `L’espace contribuable est limité à ${SRE_REGION}.`,
      );
    }
    return {
      id: utilisateur.id,
      courriel: utilisateur.courriel,
      nom: utilisateur.nom,
      role: utilisateur.role,
      ...(utilisateur.contribuable
        ? { contribuableId: utilisateur.contribuable.id }
        : {}),
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
    };
  }
}
