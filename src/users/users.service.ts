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
    private readonly utilisateurs: Repository<UserEntity>,
    private readonly sourceDeDonnees: DataSource,
  ) {}

  async lister(recherche = "", page = 1, parPage = 25) {
    const numeroPage = Math.max(1, Math.floor(page) || 1);
    const taillePage = Math.min(100, Math.max(1, Math.floor(parPage) || 25));
    const requete = this.utilisateurs
      .createQueryBuilder("utilisateur")
      .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
      .where(
        "(utilisateur.role = :roleAdmin OR contribuable.region = :region)",
        { roleAdmin: AccountRole.ADMIN, region: SRE_REGION },
      )
      .orderBy("utilisateur.creeLe", "DESC");
    const terme = recherche.trim();
    if (terme) {
      requete.andWhere(
        "(utilisateur.nom ILIKE :terme OR utilisateur.courriel ILIKE :terme OR contribuable.nif ILIKE :terme)",
        { terme: `%${terme}%` },
      );
    }
    const [lignes, total] = await requete
      .skip((numeroPage - 1) * taillePage)
      .take(taillePage)
      .getManyAndCount();
    return {
      donnees: lignes.map((utilisateur) => this.vuePublique(utilisateur)),
      total,
      page: numeroPage,
      parPage: taillePage,
    };
  }

  async modifierStatut(
    id: string,
    statut: AccountStatus,
    acteur: AuthenticatedUser,
  ) {
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      // Un verrou commun sérialise les désactivations pour protéger le dernier administrateur actif.
      await gestionnaire.query(
        "SELECT pg_advisory_xact_lock($1)",
        [2026101202],
      );
      const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
      const utilisateur = await depotUtilisateurs.findOne({
        where: { id },
        relations: { contribuable: true },
      });
      if (
        !utilisateur ||
        (utilisateur.role !== AccountRole.ADMIN &&
          utilisateur.contribuable?.region !== SRE_REGION)
      ) {
        throw new NotFoundException(
          "Utilisateur introuvable dans le périmètre du service.",
        );
      }
      if (acteur.id === id && statut !== AccountStatus.ACTIF) {
        throw new BadRequestException(
          "Vous ne pouvez pas suspendre votre propre compte.",
        );
      }
      if (
        utilisateur.role === AccountRole.ADMIN &&
        utilisateur.statut === AccountStatus.ACTIF &&
        statut !== AccountStatus.ACTIF
      ) {
        const nombreAdministrateursActifs = await depotUtilisateurs.count({
          where: { role: AccountRole.ADMIN, statut: AccountStatus.ACTIF },
        });
        if (nombreAdministrateursActifs <= 1) {
          throw new ConflictException(
            "Le dernier compte administrateur actif ne peut pas être désactivé.",
          );
        }
      }
      utilisateur.statut = statut;
      return this.vuePublique(await depotUtilisateurs.save(utilisateur));
    });
  }

  private vuePublique(utilisateur: UserEntity) {
    return {
      id: utilisateur.id,
      nom: utilisateur.nom,
      courriel: utilisateur.courriel,
      role: utilisateur.role,
      statut: utilisateur.statut,
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
      creeLe: utilisateur.creeLe,
      derniereConnexion: utilisateur.derniereConnexion,
      contribuableId: utilisateur.contribuable?.id,
      contribuable: utilisateur.contribuable
        ? {
            type: utilisateur.contribuable.type,
            nom: utilisateur.contribuable.nom,
            prenom: utilisateur.contribuable.prenom,
            raisonSociale: utilisateur.contribuable.raisonSociale,
            nif: utilisateur.contribuable.nif,
          }
        : undefined,
    };
  }
}
