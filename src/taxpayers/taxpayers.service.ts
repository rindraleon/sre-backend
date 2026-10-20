import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource, Repository } from "typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  AccountRole,
  AccountStatus,
  ActivationEmailStatus,
  TaxpayerType,
} from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { ActivationService } from "../notifications/activation.service";
import { isValidEmail } from "../notifications/mail.service";
import { CreateTaxpayerDto } from "./dto/create-taxpayer.dto";
import { UpdateTaxpayerProfileDto } from "./dto/update-taxpayer-profile.dto";

/** État détaillé d'une ligne d'import Excel. */
export interface LigneImport {
  ligne: number;
  libelle: string;
  statut: "COMPTE_CREE" | "PROFIL_CREE" | "DOUBLON" | "REJETE";
  motif?: string;
  erreurs?: string[];
  profilId?: string;
  compteId?: string;
  statutCourriel?: string;
}

@Injectable()
export class TaxpayersService {
  constructor(
    @InjectRepository(TaxpayerEntity)
    private readonly contribuables: Repository<TaxpayerEntity>,
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly configuration: ConfigService,
    private readonly activation: ActivationService,
  ) {}

  async obtenirMonProfil(utilisateur: AuthenticatedUser) {
    if (!utilisateur.contribuableId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const contribuable = await this.contribuables.findOne({
      where: { id: utilisateur.contribuableId, region: SRE_REGION },
      relations: { utilisateur: true },
    });
    if (!contribuable)
      throw new NotFoundException(
        "Profil contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.vueContribuable(contribuable);
  }

  async modifierMonProfil(
    utilisateur: AuthenticatedUser,
    donnees: UpdateTaxpayerProfileDto,
  ) {
    if (!utilisateur.contribuableId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const contribuable = await this.contribuables.findOne({
      where: { id: utilisateur.contribuableId, region: SRE_REGION },
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
      .where("contribuable.region = :region", { region: SRE_REGION })
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
      where: { id, region: SRE_REGION },
      relations: { utilisateur: true },
    });
    if (!contribuable)
      throw new NotFoundException(
        "Contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.vueContribuable(contribuable);
  }

  async creerPourAdministration(donnees: CreateTaxpayerDto) {
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
      region: SRE_REGION,
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

  /**
   * Import Excel (données lues et pré-validées côté client, validées puis
   * enregistrées ici) :
   * - chaque ligne reçoit un état détaillé (compte créé, profil créé, doublon,
   *   rejetée avec ses erreurs) ;
   * - chaque entreprise valide (raison sociale + e-mail + STAT) reçoit un
   *   compte distinct lié à son profil, avec le STAT comme mot de passe
   *   provisoire haché (jamais stocké en clair) ;
   * - un courriel d'activation (lien à usage unique + identifiants provisoires)
   *   est déclenché pour chaque compte créé, avec suivi d'envoi et réessai ;
   * - idempotence : une nouvelle importation du même fichier ne crée aucun
   *   compte ni profil en double (doublons signalés ligne par ligne).
   */
  async importer(profils: CreateTaxpayerDto[]) {
    if (!profils.length)
      throw new BadRequestException(
        "Aucun profil à importer n'a été transmis.",
      );

    // Hachage des mots de passe provisoires en parallèle AVANT la transaction
    // (bcrypt est coûteux : la transaction reste courte).
    const tours = Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12"));
    const typesDeLigne = profils.map((donnees) => {
      const courriel = donnees.courriel?.trim().toLowerCase() ?? "";
      const stat = donnees.stat?.trim().toUpperCase() || null;
      const estEntrepriseAvecCompte =
        donnees.type === TaxpayerType.ENTREPRISE &&
        Boolean(stat) &&
        isValidEmail(courriel) &&
        Boolean(donnees.raisonSociale?.trim());
      return { courriel, stat, estEntrepriseAvecCompte };
    });
    const hashes = await Promise.all(
      typesDeLigne.map((entree) =>
        entree.estEntrepriseAvecCompte && entree.stat
          ? bcrypt.hash(entree.stat, tours)
          : Promise.resolve(null),
      ),
    );

    const resultat = await this.sourceDeDonnees.transaction(
      async (gestionnaire) => {
        const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
        const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
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

        const rapport: LigneImport[] = [];
        const nouveaux: TaxpayerEntity[] = [];
        const comptesCrees: {
          utilisateur: UserEntity;
          libelle: string;
          stat: string;
        }[] = [];
        let ignorees = 0;
        let doublons = 0;
        let rejetees = 0;
        let comptesCreesNombre = 0;

        for (const [index, donnees] of profils.entries()) {
          const ligne = index + 1;
          const entree = typesDeLigne[index];
          const courriel = entree.courriel;
          const stat = entree.stat;
          const nif = donnees.nif?.trim().toUpperCase() || null;
          const libelle =
            donnees.raisonSociale?.trim() || donnees.nom?.trim() || courriel;
          const erreurs: string[] = [];

          // 1. Présence et validité des informations nécessaires.
          if (!isValidEmail(courriel))
            erreurs.push("Adresse e-mail absente ou invalide.");
          if (donnees.type === TaxpayerType.ENTREPRISE) {
            if (!donnees.raisonSociale?.trim())
              erreurs.push("Raison sociale manquante.");
            if (!stat) erreurs.push("Numéro STAT manquant.");
          }
          if (erreurs.length) {
            rejetees += 1;
            rapport.push({ ligne, libelle, statut: "REJETE", erreurs });
            continue;
          }

          // 2. Doublons (e-mail, NIF, STAT déjà enregistrés).
          if (courriels.has(courriel)) {
            doublons += 1;
            ignorees += 1;
            rapport.push({
              ligne,
              libelle,
              statut: "DOUBLON",
              motif: "Adresse e-mail déjà enregistrée (profil ou compte existant).",
            });
            continue;
          }
          if (nif && nifs.has(nif)) {
            doublons += 1;
            ignorees += 1;
            rapport.push({
              ligne,
              libelle,
              statut: "DOUBLON",
              motif: "NIF déjà enregistré.",
            });
            continue;
          }
          if (stat && stats.has(stat)) {
            doublons += 1;
            ignorees += 1;
            rapport.push({
              ligne,
              libelle,
              statut: "DOUBLON",
              motif: "Numéro STAT déjà enregistré.",
            });
            continue;
          }

          // 3. Création du profil, puis du compte pour les entreprises valides.
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
            region: SRE_REGION,
            ville: donnees.ville.trim(),
            courriel,
            telephone: donnees.telephone.trim(),
            representantLegal: donnees.representantLegal?.trim() || null,
            nomContact: donnees.nomContact?.trim() || null,
            prenomContact: donnees.prenomContact?.trim() || null,
            fonctionContact: donnees.fonctionContact?.trim() || null,
            dateCreationCompte: new Date(),
          });
          const profilEnregistre = await depotContribuables.save(profil);
          nouveaux.push(profilEnregistre);
          courriels.add(courriel);
          if (nif) nifs.add(nif);
          if (stat) stats.add(stat);

          if (entree.estEntrepriseAvecCompte && stat && hashes[index]) {
            // Compte distinct : STAT = mot de passe provisoire (haché),
            // configuration initiale obligatoire avant tout accès métier.
            const utilisateur = await depotUtilisateurs.save(
              depotUtilisateurs.create({
                nom: libelle.slice(0, 160),
                courriel,
                motDePasseHash: hashes[index] as string,
                role: AccountRole.CLIENT,
                statut: AccountStatus.ACTIF,
                changementMotDePasseRequis: true,
                profilComplete: false,
              }),
            );
            profilEnregistre.utilisateur = utilisateur;
            await depotContribuables.save(profilEnregistre);
            comptesCreesNombre += 1;
            comptesCrees.push({ utilisateur, libelle, stat });
            rapport.push({
              ligne,
              libelle,
              statut: "COMPTE_CREE",
              profilId: profilEnregistre.id,
              compteId: utilisateur.id,
            });
          } else {
            rapport.push({
              ligne,
              libelle,
              statut: "PROFIL_CREE",
              profilId: profilEnregistre.id,
            });
          }
        }

        return {
          rapport,
          donnees: nouveaux.map((contribuable) =>
            this.vueContribuable(contribuable),
          ),
          creees: nouveaux.length,
          ignorees,
          comptesCrees: comptesCreesNombre,
          doublons,
          rejetees,
          comptes: comptesCrees.map((entree) => ({
            utilisateur: entree.utilisateur,
            libelle: entree.libelle,
            stat: entree.stat,
          })),
        };
      },
    );

    // 4. Courriels de première connexion, hors transaction : un échec d'envoi
    // n'annule pas la création des comptes (statut suivi + réessai par l'admin).
    const emails = [];
    for (const entree of resultat.comptes) {
      try {
        const demande = await this.activation.creerDemandeActivation(
          entree.utilisateur,
          entree.libelle,
          entree.stat,
        );
        emails.push({
          compteId: entree.utilisateur.id,
          destinataire: demande.destinataire,
          statutCourriel: demande.statutCourriel,
          demandeId: demande.id,
        });
      } catch {
        emails.push({
          compteId: entree.utilisateur.id,
          destinataire: entree.utilisateur.courriel,
          statutCourriel: ActivationEmailStatus.ECHEC,
          demandeId: null,
        });
      }
    }
    for (const entree of resultat.rapport) {
      if (entree.statut === "COMPTE_CREE") {
        const email = emails.find((e) => e.compteId === entree.compteId);
        if (email) entree.statutCourriel = email.statutCourriel;
      }
    }

    return {
      donnees: resultat.donnees,
      creees: resultat.creees,
      ignorees: resultat.ignorees,
      rapport: resultat.rapport,
      comptesCrees: resultat.comptesCrees,
      doublons: resultat.doublons,
      rejetees: resultat.rejetees,
      emails,
    };
  }

  async supprimer(id: string) {
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
      // PostgreSQL interdit FOR UPDATE sur le côté nullable d'une jointure
      // externe : on verrouille d'abord la seule ligne contribuable, puis on
      // charge la relation utilisateur (facultative) hors du verrou.
      const verrou = await depotContribuables.findOne({
        where: { id, region: SRE_REGION },
        lock: { mode: "pessimistic_write" },
      });
      if (!verrou) throw new NotFoundException("Contribuable introuvable.");
      const contribuable = await depotContribuables.findOne({
        where: { id, region: SRE_REGION },
        relations: { utilisateur: true },
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
          .getRepository(PaymentEntity)
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

  private vueContribuable(contribuable: TaxpayerEntity) {
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
