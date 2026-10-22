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
    private readonly users: Repository<UserEntity>,
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
    payload: Pick<AuthenticatedUser, "id">,
  ): Promise<AuthenticatedUser> {
    if (!payload?.id) throw new UnauthorizedException("Jeton invalide.");
    const user = await this.users.findOne({
      where: { id: payload.id },
      relations: { taxpayer: true },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException("Compte inactif ou introuvable.");
    }
    if (
      user.role === AccountRole.CLIENT &&
      user.taxpayer?.region !== SRE_REGION
    ) {
      throw new UnauthorizedException(
        `L’espace contribuable est limité à ${SRE_REGION}.`,
      );
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      ...(user.taxpayer
        ? { taxpayerId: user.taxpayer.id }
        : {}),
      mustChangePassword: user.mustChangePassword,
      isProfileComplete: user.isProfileComplete,
    };
  }
}
