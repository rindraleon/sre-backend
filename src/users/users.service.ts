import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(search = "", page = 1, perPage = 25) {
    const pageNumber = Math.max(1, Math.floor(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(perPage) || 25));
    const request = this.users
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.taxpayer", "taxpayer")
      .where(
        "(user.role = :roleAdmin OR taxpayer.region = :region)",
        { roleAdmin: AccountRole.ADMIN, region: SRE_REGION },
      )
      .orderBy("user.createdAt", "DESC");
    const term = search.trim();
    if (term) {
      request.andWhere(
        "(user.name ILIKE :term OR user.email ILIKE :term OR taxpayer.nif ILIKE :term)",
        { term: `%${term}%` },
      );
    }
    const [rows, total] = await request
      .skip((pageNumber - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      donnees: rows.map((user) => this.toPublicView(user)),
      total,
      page: pageNumber,
      parPage: pageSize,
    };
  }

  async updateStatus(
    id: string,
    status: AccountStatus,
    actor: AuthenticatedUser,
  ) {
    return this.dataSource.transaction(async (manager) => {
      // A shared lock serializes deactivations to protect the last active administrator.
      await manager.query(
        "SELECT pg_advisory_xact_lock($1)",
        [2026101202],
      );
      const usersRepository = manager.getRepository(UserEntity);
      const user = await usersRepository.findOne({
        where: { id },
        relations: { taxpayer: true },
      });
      if (
        !user ||
        (user.role !== AccountRole.ADMIN &&
          user.taxpayer?.region !== SRE_REGION)
      ) {
        throw new NotFoundException(
          "Utilisateur introuvable dans le périmètre du service.",
        );
      }
      if (actor.id === id && status !== AccountStatus.ACTIVE) {
        throw new BadRequestException(
          "Vous ne pouvez pas suspendre votre propre compte.",
        );
      }
      if (
        user.role === AccountRole.ADMIN &&
        user.status === AccountStatus.ACTIVE &&
        status !== AccountStatus.ACTIVE
      ) {
        const activeAdministratorsCount = await usersRepository.count({
          where: { role: AccountRole.ADMIN, status: AccountStatus.ACTIVE },
        });
        if (activeAdministratorsCount <= 1) {
          throw new ConflictException(
            "Le dernier compte administrateur actif ne peut pas être désactivé.",
          );
        }
      }
      user.status = status;
      return this.toPublicView(await usersRepository.save(user));
    });
  }

  private toPublicView(user: UserEntity) {
    return {
      id: user.id,
      nom: user.name,
      courriel: user.email,
      role: user.role,
      statut: user.status,
      changementMotDePasseRequis: user.mustChangePassword,
      creeLe: user.createdAt,
      derniereConnexion: user.lastLoginAt,
      contribuableId: user.taxpayer?.id,
      contribuable: user.taxpayer
        ? {
            type: user.taxpayer.type,
            nom: user.taxpayer.lastName,
            prenom: user.taxpayer.firstName,
            raisonSociale: user.taxpayer.legalName,
            nif: user.taxpayer.nif,
          }
        : undefined,
    };
  }
}
