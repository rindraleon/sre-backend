import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Repository } from "typeorm";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { StatutCompte, RoleCompte } from "../base-de-donnees/enums";
import { REGION_SRE } from "../base-de-donnees/region-sre";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configuration: ConfigService,
    @InjectRepository(UtilisateurEntity)
    private readonly utilisateurs: Repository<UtilisateurEntity>,
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
    charge: Pick<UtilisateurAuthentifie, "id">,
  ): Promise<UtilisateurAuthentifie> {
    if (!charge?.id) throw new UnauthorizedException("Jeton invalide.");
    const utilisateur = await this.utilisateurs.findOne({
      where: { id: charge.id },
      relations: { contribuable: true },
    });
    if (!utilisateur || utilisateur.statut !== StatutCompte.ACTIF) {
      throw new UnauthorizedException("Compte inactif ou introuvable.");
    }
    if (
      utilisateur.role === RoleCompte.CLIENT &&
      utilisateur.contribuable?.region !== REGION_SRE
    ) {
      throw new UnauthorizedException(
        `L’espace contribuable est limité à ${REGION_SRE}.`,
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
