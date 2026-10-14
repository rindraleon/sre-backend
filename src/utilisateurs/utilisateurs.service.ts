import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { RoleCompte, StatutCompte } from "../base-de-donnees/enums";
import { REGION_SRE } from "../base-de-donnees/region-sre";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";

@Injectable()
export class UtilisateursService {
  constructor(
    @InjectRepository(UtilisateurEntity)
    private readonly utilisateurs: Repository<UtilisateurEntity>,
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
        { roleAdmin: RoleCompte.ADMIN, region: REGION_SRE },
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
    statut: StatutCompte,
    acteur: UtilisateurAuthentifie,
  ) {
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      // Un verrou commun sérialise les désactivations pour protéger le dernier administrateur actif.
      await gestionnaire.query(
        "SELECT pg_advisory_xact_lock($1)",
        [2026101202],
      );
      const depotUtilisateurs = gestionnaire.getRepository(UtilisateurEntity);
      const utilisateur = await depotUtilisateurs.findOne({
        where: { id },
        relations: { contribuable: true },
      });
      if (
        !utilisateur ||
        (utilisateur.role !== RoleCompte.ADMIN &&
          utilisateur.contribuable?.region !== REGION_SRE)
      ) {
        throw new NotFoundException(
          "Utilisateur introuvable dans le périmètre du service.",
        );
      }
      if (acteur.id === id && statut !== StatutCompte.ACTIF) {
        throw new BadRequestException(
          "Vous ne pouvez pas suspendre votre propre compte.",
        );
      }
      if (
        utilisateur.role === RoleCompte.ADMIN &&
        utilisateur.statut === StatutCompte.ACTIF &&
        statut !== StatutCompte.ACTIF
      ) {
        const nombreAdministrateursActifs = await depotUtilisateurs.count({
          where: { role: RoleCompte.ADMIN, statut: StatutCompte.ACTIF },
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

  private vuePublique(utilisateur: UtilisateurEntity) {
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
