import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { ContribuableEntity } from "../base-de-donnees/entities/contribuable.entity";
import { ObligationEntity } from "../base-de-donnees/entities/obligation.entity";
import { PaiementEntity } from "../base-de-donnees/entities/paiement.entity";
import { UtilisateurEntity } from "../base-de-donnees/entities/utilisateur.entity";
import { REGION_SRE } from "../base-de-donnees/region-sre";
import { UtilisateurAuthentifie } from "../commun/interfaces/utilisateur-authentifie.interface";
import { CreerContribuableDto } from "./dto/creer-contribuable.dto";
import { ModifierProfilContribuableDto } from "./dto/modifier-profil-contribuable.dto";

@Injectable()
export class ContribuablesService {
  constructor(
    @InjectRepository(ContribuableEntity)
    private readonly contribuables: Repository<ContribuableEntity>,
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(PaiementEntity)
    private readonly paiements: Repository<PaiementEntity>,
    @InjectRepository(UtilisateurEntity)
    private readonly utilisateurs: Repository<UtilisateurEntity>,
    private readonly sourceDeDonnees: DataSource,
  ) {}

  async obtenirMonProfil(utilisateur: UtilisateurAuthentifie) {
    if (!utilisateur.contribuableId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const contribuable = await this.contribuables.findOne({
      where: { id: utilisateur.contribuableId, region: REGION_SRE },
      relations: { utilisateur: true },
    });
    if (!contribuable)
      throw new NotFoundException(
        "Profil contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.vueContribuable(contribuable);
  }

  async modifierMonProfil(
    utilisateur: UtilisateurAuthentifie,
    donnees: ModifierProfilContribuableDto,
  ) {
    if (!utilisateur.contribuableId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const contribuable = await this.contribuables.findOne({
      where: { id: utilisateur.contribuableId, region: REGION_SRE },
      relations: { utilisateur: true },
    });
    if (!contribuable)
      throw new NotFoundException("Profil contribuable introuvable.");
    if (
      donnees.nomCommercial !== undefined &&
      contribuable.type !== "ENTREPRISE"
    ) {
      throw new BadRequestException(
        "Le nom commercial ne concerne que les profils entreprise.",
      );
    }
    if (donnees.adresse !== undefined)
      contribuable.adresse = donnees.adresse.trim();
    if (donnees.ville !== undefined) contribuable.ville = donnees.ville.trim();
    if (donnees.telephone !== undefined)
      contribuable.telephone = donnees.telephone.trim();
    if (donnees.nomCommercial !== undefined)
      contribuable.nomCommercial = donnees.nomCommercial.trim() || null;
    return this.vueContribuable(await this.contribuables.save(contribuable));
  }

  async lister(recherche = "", page = 1, parPage = 25) {
    const numeroPage = Math.max(1, Math.floor(page) || 1);
    const taillePage = Math.min(100, Math.max(1, Math.floor(parPage) || 25));
    const terme = recherche.trim();
    const requete = this.contribuables
      .createQueryBuilder("contribuable")
      .leftJoinAndSelect("contribuable.utilisateur", "utilisateur")
      .where("contribuable.region = :region", { region: REGION_SRE })
      .orderBy("contribuable.creeLe", "DESC");
    if (terme) {
      requete.andWhere(
        "contribuable.nom ILIKE :terme OR contribuable.prenom ILIKE :terme OR contribuable.raison_sociale ILIKE :terme OR contribuable.nif ILIKE :terme OR contribuable.courriel ILIKE :terme",
        { terme: `%${terme}%` },
      );
    }
    const [lignes, total] = await requete
      .skip((numeroPage - 1) * taillePage)
      .take(taillePage)
      .getManyAndCount();
    return {
      donnees: lignes.map((contribuable) => this.vueContribuable(contribuable)),
      total,
      page: numeroPage,
      parPage: taillePage,
    };
  }

  async obtenirUne(id: string) {
    const contribuable = await this.contribuables.findOne({
      where: { id, region: REGION_SRE },
      relations: { utilisateur: true },
    });
    if (!contribuable)
      throw new NotFoundException(
        "Contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.vueContribuable(contribuable);
  }

  async creerPourAdministration(donnees: CreerContribuableDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const nif = donnees.nif?.trim().toUpperCase() || null;
    const stat = donnees.stat?.trim().toUpperCase() || null;
    if (
      (await this.utilisateurs.exist({ where: { courriel } })) ||
      (await this.contribuables.exist({
        where: [
          { courriel },
          ...(nif ? [{ nif }] : []),
          ...(stat ? [{ stat }] : []),
        ],
      }))
    ) {
      throw new ConflictException(
        "Un profil utilise déjà cette adresse e-mail, ce NIF ou ce STAT.",
      );
    }
    const profil = this.contribuables.create({
      utilisateur: null,
      type: donnees.type,
      nom: donnees.nom.trim(),
      prenom: donnees.prenom?.trim() || null,
      raisonSociale: donnees.raisonSociale?.trim() || null,
      nomCommercial: donnees.nomCommercial?.trim() || null,
      nif,
      stat,
      adresse: donnees.adresse.trim(),
      region: REGION_SRE,
      ville: donnees.ville.trim(),
      courriel,
      telephone: donnees.telephone.trim(),
      representantLegal: donnees.representantLegal?.trim() || null,
      nomContact: donnees.nomContact?.trim() || null,
      prenomContact: donnees.prenomContact?.trim() || null,
      fonctionContact: donnees.fonctionContact?.trim() || null,
      dateCreationCompte: new Date(),
    });
    return this.vueContribuable(await this.contribuables.save(profil));
  }

  async importer(profils: CreerContribuableDto[]) {
    if (!profils.length)
      throw new BadRequestException(
        "Aucun profil à importer n'a été transmis.",
      );
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotContribuables = gestionnaire.getRepository(ContribuableEntity);
      const depotUtilisateurs = gestionnaire.getRepository(UtilisateurEntity);
      const existants = await depotContribuables.find({
        select: { courriel: true, nif: true, stat: true },
      });
      const comptes = await depotUtilisateurs.find({
        select: { courriel: true },
      });
      const courriels = new Set([
        ...existants.map((entree) => entree.courriel.toLowerCase()),
        ...comptes.map((entree) => entree.courriel.toLowerCase()),
      ]);
      const nifs = new Set(
        existants
          .map((entree) => entree.nif?.toUpperCase())
          .filter((valeur): valeur is string => Boolean(valeur)),
      );
      const stats = new Set(
        existants
          .map((entree) => entree.stat?.toUpperCase())
          .filter((valeur): valeur is string => Boolean(valeur)),
      );
      const nouveaux: ContribuableEntity[] = [];
      let ignorees = 0;

      for (const donnees of profils) {
        const courriel = donnees.courriel.trim().toLowerCase();
        const nif = donnees.nif?.trim().toUpperCase() || null;
        const stat = donnees.stat?.trim().toUpperCase() || null;
        if (
          courriels.has(courriel) ||
          (nif && nifs.has(nif)) ||
          (stat && stats.has(stat))
        ) {
          ignorees += 1;
          continue;
        }
        const profil = depotContribuables.create({
          utilisateur: null,
          type: donnees.type,
          nom: donnees.nom.trim(),
          prenom: donnees.prenom?.trim() || null,
          raisonSociale: donnees.raisonSociale?.trim() || null,
          nomCommercial: donnees.nomCommercial?.trim() || null,
          nif,
          stat,
          adresse: donnees.adresse.trim(),
          region: REGION_SRE,
          ville: donnees.ville.trim(),
          courriel,
          telephone: donnees.telephone.trim(),
          representantLegal: donnees.representantLegal?.trim() || null,
          nomContact: donnees.nomContact?.trim() || null,
          prenomContact: donnees.prenomContact?.trim() || null,
          fonctionContact: donnees.fonctionContact?.trim() || null,
          dateCreationCompte: new Date(),
        });
        nouveaux.push(await depotContribuables.save(profil));
        courriels.add(courriel);
        if (nif) nifs.add(nif);
        if (stat) stats.add(stat);
      }

      return {
        donnees: nouveaux.map((contribuable) =>
          this.vueContribuable(contribuable),
        ),
        creees: nouveaux.length,
        ignorees,
      };
    });
  }

  async supprimer(id: string) {
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotContribuables = gestionnaire.getRepository(ContribuableEntity);
      const contribuable = await depotContribuables.findOne({
        where: { id, region: REGION_SRE },
        relations: { utilisateur: true },
        lock: { mode: "pessimistic_write" },
      });
      if (!contribuable)
        throw new NotFoundException("Contribuable introuvable.");
      if (contribuable.utilisateur) {
        throw new ConflictException(
          "Ce profil est associé à un compte utilisateur. Désactivez le compte plutôt que de supprimer son dossier.",
        );
      }
      const [aDesObligations, aDesPaiements] = await Promise.all([
        gestionnaire
          .getRepository(ObligationEntity)
          .exist({ where: { contribuable: { id } } }),
        gestionnaire
          .getRepository(PaiementEntity)
          .exist({ where: { contribuable: { id } } }),
      ]);
      if (aDesObligations || aDesPaiements) {
        throw new ConflictException(
          "Ce profil possède un historique fiscal ou de paiement et ne peut pas être supprimé.",
        );
      }
      await depotContribuables.remove(contribuable);
      return { message: "Le profil contribuable a été supprimé." };
    });
  }

  private vueContribuable(contribuable: ContribuableEntity) {
    return {
      id: contribuable.id,
      utilisateurId: contribuable.utilisateur?.id,
      type: contribuable.type,
      nom: contribuable.nom,
      prenom: contribuable.prenom,
      raisonSociale: contribuable.raisonSociale,
      nomCommercial: contribuable.nomCommercial,
      nif: contribuable.nif,
      stat: contribuable.stat,
      adresse: contribuable.adresse,
      region: contribuable.region,
      ville: contribuable.ville,
      courriel: contribuable.courriel,
      telephone: contribuable.telephone,
      representantLegal: contribuable.representantLegal,
      nomContact: contribuable.nomContact,
      prenomContact: contribuable.prenomContact,
      fonctionContact: contribuable.fonctionContact,
      dateCreationCompte: contribuable.dateCreationCompte,
      creeLe: contribuable.creeLe,
      statutCompte: contribuable.utilisateur?.statut ?? null,
    };
  }
}
