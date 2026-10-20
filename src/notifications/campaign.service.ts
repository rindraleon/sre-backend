import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  NotificationEntity,
  NotificationEmailStatus,
} from "../database/entities/notification.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { UserEntity } from "../database/entities/user.entity";
import { ObligationStatus } from "../database/enums";
import { SRE_REGION } from "../database/region";
import {
  buildEmailHtml,
  isValidEmail,
  MAIL_SERVICE,
  type MailSender,
} from "./mail.service";
import { civilDateInTimezone, daysUntilDeadline, DEFAULT_TIMEZONE } from "./deadline-reminders.service";

/** Type d'historique des campagnes manuelles de notification de retard. */
export const TYPE_RAPPEL_MANUEL = "RETARD_MANUEL";

/**
 * Situation d'un dossier au regard des retards — catégories distinctes pour
 * le suivi : régularisé, en vérification (traitement particulier), rejeté,
 * correction demandée, en retard ou en attente.
 */
export type SituationRetard =
  | "REGULARISE"
  | "EN_VERIFICATION"
  | "REJETE"
  | "CORRECTION_DEMANDEE"
  | "EN_RETARD"
  | "EN_ATTENTE";

export interface LigneRetard {
  obligationId: string;
  referenceFiscale: string;
  periode: string;
  typeImpot: string;
  montant: string;
  devise: string;
  echeance: string;
  joursRestants: number;
  joursRetard: number;
  statut: ObligationStatus;
  situation: SituationRetard;
  entite: {
    id: string;
    nom: string;
    type: string;
    stat: string | null;
    nif: string | null;
    courriel: string | null;
  };
}

export interface ResultatDestinataire {
  obligationId: string;
  destinataire: string;
  reference: string;
  resultat: "ENVOYEE" | "DEJA_ENVOYEE" | "IGNOREE" | "SANS_COMPTE" | "ECHEC";
  statutCourriel: NotificationEmailStatus;
  erreur?: string;
}

export interface BilanCampagne {
  totalSelectionnes: number;
  notificationsCreees: number;
  dejaEnvoyees: number;
  ignorees: number;
  sansCompte: number;
  echecs: number;
  courrielsEnvoyes: number;
  courrielsNonConfigures: number;
  details: ResultatDestinataire[];
}

export function situationDeDepuisStatut(
  statut: ObligationStatus,
  joursRestants: number,
): SituationRetard {
  if (statut === ObligationStatus.PAYE) return "REGULARISE";
  if (
    statut === ObligationStatus.EN_VERIFICATION ||
    statut === ObligationStatus.PAIEMENT_EN_COURS
  )
    return "EN_VERIFICATION";
  if (statut === ObligationStatus.REJETE) return "REJETE";
  if (statut === ObligationStatus.CORRECTION_DEMANDEE)
    return "CORRECTION_DEMANDEE";
  return joursRestants < 0 ? "EN_RETARD" : "EN_ATTENTE";
}

function nomEntite(contribuable: {
  raisonSociale?: string | null;
  nom?: string;
  prenom?: string | null;
}): string {
  return (
    contribuable.raisonSociale?.trim() ||
    `${contribuable.prenom ?? ""} ${contribuable.nom ?? ""}`.trim() ||
    "Contribuable"
  );
}

/**
 * Suivi des retards et campagnes de notifications groupées (administration).
 *
 * - La liste des retards est calculée depuis les dates d'échéance et les
 *   statuts enregistrés ; les dossiers régularisés en sont exclus par défaut.
 * - Une campagne crée une notification par destinataire (in-app + courriel si
 *   un transport est configuré), rend le message à partir d'un modèle commun
 *   sans jamais mélanger les données de deux entités, refuse les doublons du
 *   même jour (clé d'idempotence) et rapporte les échecs partiels.
 * - L'état « DELIVRE » n'est jamais posé : aucun fournisseur de messagerie ne
 *   confirme la livraison dans le périmètre actuel.
 */
@Injectable()
export class CampaignService {
  private readonly journal = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @Inject(MAIL_SERVICE) private readonly courriel: MailSender,
    private readonly configuration: ConfigService,
  ) {}

  private get fuseauHoraire(): string {
    return this.configuration.get<string>("FUSEAU_HORAIRE", DEFAULT_TIMEZONE);
  }

  async listerRetards(options: {
    recherche?: string;
    situation?: string;
    type?: string;
    inclureRegularises?: boolean;
  }): Promise<LigneRetard[]> {
    const maintenant = new Date();
    const requete = this.obligations
      .createQueryBuilder("obligation")
      .innerJoinAndSelect("obligation.contribuable", "contribuable")
      .innerJoinAndSelect("obligation.typeImpot", "typeImpot")
      .where("contribuable.region = :region", { region: SRE_REGION });

    if (options.type) {
      requete.andWhere("contribuable.type = :type", { type: options.type });
    }
    if (options.recherche?.trim()) {
      const motif = `%${options.recherche.trim().toLowerCase()}%`;
      requete.andWhere(
        `(LOWER(contribuable.nom) LIKE :motif
          OR LOWER(COALESCE(contribuable.prenom, '')) LIKE :motif
          OR LOWER(COALESCE(contribuable.raisonSociale, '')) LIKE :motif
          OR LOWER(COALESCE(contribuable.stat, '')) LIKE :motif
          OR LOWER(obligation.referenceFiscale) LIKE :motif)`,
        { motif },
      );
    }

    const lignes = (await requete.getMany()).map((obligation) => {
      const joursRestants = daysUntilDeadline(
        obligation.echeance,
        maintenant,
        this.fuseauHoraire,
      );
      const situation = situationDeDepuisStatut(obligation.statut, joursRestants);
      return {
        obligationId: obligation.id,
        referenceFiscale: obligation.referenceFiscale,
        periode: obligation.periode,
        typeImpot: obligation.typeImpot?.nom ?? "Obligation",
        montant: obligation.montant,
        devise: obligation.devise,
        echeance: obligation.echeance.slice(0, 10),
        joursRestants,
        joursRetard: Math.max(0, -joursRestants),
        statut: obligation.statut,
        situation,
        entite: {
          id: obligation.contribuable.id,
          nom: nomEntite(obligation.contribuable),
          type: obligation.contribuable.type,
          stat: obligation.contribuable.stat ?? null,
          nif: obligation.contribuable.nif ?? null,
          courriel: obligation.contribuable.courriel ?? null,
        },
      } satisfies LigneRetard;
    });

    return lignes
      .filter((ligne) => ligne.joursRestants <= 0)
      .filter((ligne) =>
        options.inclureRegularises ? true : ligne.situation !== "REGULARISE",
      )
      .filter((ligne) =>
        options.situation ? ligne.situation === options.situation : true,
      )
      .sort((a, b) => b.joursRetard - a.joursRetard);
  }

  /**
   * Envoi groupé : chaque destinataire reçoit son propre rendu du modèle.
   * Les dossiers régularisés sont exclus ; les doublons du même jour sont
   * signalés sans recréer de notification ; les échecs sont détaillés.
   */
  async envoyerCampagne(
    administrateur: UserEntity,
    obligationIds: string[],
    messageModele: string,
    titre?: string,
  ): Promise<BilanCampagne> {
    const bilan: BilanCampagne = {
      totalSelectionnes: obligationIds.length,
      notificationsCreees: 0,
      dejaEnvoyees: 0,
      ignorees: 0,
      sansCompte: 0,
      echecs: 0,
      courrielsEnvoyes: 0,
      courrielsNonConfigures: 0,
      details: [],
    };
    const maintenant = new Date();
    const { annee, mois, jour } = civilDateInTimezone(
      maintenant,
      this.fuseauHoraire,
    );
    const dateCampagne = `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
    const transportConfigure = Boolean(
      this.configuration.get<string>("MAIL_TRANSPORT", "").trim(),
    );

    const obligations = await this.obligations
      .createQueryBuilder("obligation")
      .innerJoinAndSelect("obligation.contribuable", "contribuable")
      .innerJoinAndSelect("obligation.typeImpot", "typeImpot")
      .leftJoinAndSelect("contribuable.utilisateur", "utilisateur")
      .where("obligation.id IN (:...ids)", { ids: obligationIds })
      .andWhere("contribuable.region = :region", { region: SRE_REGION })
      .getMany();

    for (const obligation of obligations) {
      const entite = nomEntite(obligation.contribuable);
      const reference = obligation.referenceFiscale;
      const utilisateur = obligation.contribuable?.utilisateur;
      const base: Omit<ResultatDestinataire, "resultat" | "statutCourriel"> = {
        obligationId: obligation.id,
        destinataire: entite,
        reference,
      };

      // Les dossiers régularisés ne reçoivent jamais de rappel de retard.
      if (obligation.statut === ObligationStatus.PAYE) {
        bilan.ignorees += 1;
        bilan.details.push({
          ...base,
          resultat: "IGNOREE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Dossier régularisé — rappel exclu.",
        });
        continue;
      }
      if (!utilisateur) {
        bilan.sansCompte += 1;
        bilan.details.push({
          ...base,
          resultat: "SANS_COMPTE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Aucun compte utilisateur lié à cette entité.",
        });
        continue;
      }

      const cleIdempotence = `${TYPE_RAPPEL_MANUEL}:${obligation.id}:${dateCampagne}`;
      const existante = await this.notifications.findOne({
        where: { cleIdempotence },
      });
      if (existante) {
        bilan.dejaEnvoyees += 1;
        bilan.details.push({
          ...base,
          resultat: "DEJA_ENVOYEE",
          statutCourriel: existante.statutCourriel,
          erreur: "Notification déjà envoyée aujourd'hui pour ce dossier.",
        });
        continue;
      }

      const joursRestants = daysUntilDeadline(
        obligation.echeance,
        maintenant,
        this.fuseauHoraire,
      );
      const rendu = rendreMessage(messageModele, {
        nom: entite,
        reference,
        periode: obligation.periode,
        typeImpot: obligation.typeImpot?.nom ?? "Obligation",
        echeance: obligation.echeance.slice(0, 10),
        joursRetard: String(Math.max(0, -joursRestants)),
        montant: `${obligation.montant} ${obligation.devise}`,
      });

      let statutCourriel = NotificationEmailStatus.NON_CONFIGURE;
      if (!transportConfigure) {
        statutCourriel = NotificationEmailStatus.NON_CONFIGURE;
      }

      const notification = this.notifications.create({
        utilisateur,
        obligation,
        creePar: administrateur,
        typeRappel: TYPE_RAPPEL_MANUEL,
        titre: titre?.trim() || "Notification de retard — dossier fiscal",
        message: rendu,
        lien: "/client/obligations",
        lue: false,
        cleIdempotence,
        statutCourriel,
        tentativesCourriel: 0,
        derniereErreurCourriel: null,
        courrielEnvoyeLe: null,
      });

      try {
        await this.notifications.save(notification);
      } catch (erreur) {
        if ((erreur as { code?: string }).code === "23505") {
          bilan.dejaEnvoyees += 1;
          bilan.details.push({
            ...base,
            resultat: "DEJA_ENVOYEE",
            statutCourriel: NotificationEmailStatus.EN_ATTENTE,
            erreur: "Envoi concurrent détecté — notification déjà créée.",
          });
          continue;
        }
        bilan.echecs += 1;
        bilan.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.ECHEC,
          erreur:
            erreur instanceof Error
              ? erreur.message.slice(0, 300)
              : "Échec d'enregistrement.",
        });
        continue;
      }
      bilan.notificationsCreees += 1;

      // Courriel : jamais annoncé comme envoyé sans tentative réelle.
      if (!transportConfigure) {
        bilan.courrielsNonConfigures += 1;
        bilan.details.push({
          ...base,
          resultat: "ENVOYEE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Aucun transport de courriel configuré — notification in-app créée.",
        });
        continue;
      }
      const destinataireCourriel = obligation.contribuable?.courriel ?? "";
      if (!isValidEmail(destinataireCourriel)) {
        notification.statutCourriel = NotificationEmailStatus.ECHEC;
        notification.tentativesCourriel = 1;
        notification.derniereErreurCourriel =
          "Adresse e-mail absente ou invalide.";
        await this.notifications.save(notification);
        bilan.echecs += 1;
        bilan.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.ECHEC,
          erreur: "Adresse e-mail absente ou invalide.",
        });
        continue;
      }

      notification.tentativesCourriel += 1;
      try {
        const appUrl = this.configuration.get<string>(
          "APP_URL",
          "http://localhost:5173",
        );
        await this.courriel.envoyer({
          destinataire: destinataireCourriel,
          nomDestinataire: entite,
          sujet: notification.titre,
          texte: `${rendu}\n\nConsulter mon espace : ${appUrl}/client/obligations`,
          html: buildEmailHtml({
            nomDestinataire: entite,
            titre: notification.titre,
            message: rendu,
            lienApplication: `${appUrl}/client/obligations`,
          }),
        });
        notification.statutCourriel = NotificationEmailStatus.ENVOYE;
        notification.courrielEnvoyeLe = new Date();
        notification.derniereErreurCourriel = null;
        bilan.courrielsEnvoyes += 1;
        await this.notifications.save(notification);
        bilan.details.push({
          ...base,
          resultat: "ENVOYEE",
          statutCourriel: NotificationEmailStatus.ENVOYE,
        });
      } catch (erreur) {
        notification.statutCourriel = NotificationEmailStatus.ECHEC;
        notification.derniereErreurCourriel = (
          erreur instanceof Error
            ? erreur.message
            : "Échec d'envoi du courriel."
        ).slice(0, 300);
        await this.notifications.save(notification);
        bilan.echecs += 1;
        bilan.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.ECHEC,
          erreur: notification.derniereErreurCourriel ?? undefined,
        });
        this.journal.warn(
          `Courriel de campagne en échec (notification=${notification.id}, obligation=${obligation.id})`,
        );
      }
    }

    // Dossiers sélectionnés absents du périmètre ou introuvables.
    const traites = new Set(obligations.map((obligation) => obligation.id));
    for (const id of obligationIds) {
      if (!traites.has(id)) {
        bilan.echecs += 1;
        bilan.details.push({
          obligationId: id,
          destinataire: "—",
          reference: "—",
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.ECHEC,
          erreur: "Dossier introuvable dans le périmètre du service.",
        });
      }
    }

    this.journal.log(`Campagne de notifications : ${JSON.stringify({
      total: bilan.totalSelectionnes,
      creees: bilan.notificationsCreees,
      dejaEnvoyees: bilan.dejaEnvoyees,
      ignorees: bilan.ignorees,
      echecs: bilan.echecs,
    })}`);
    return bilan;
  }

  /** Historique des campagnes manuelles (destinataire, dossier, auteur, statut). */
  async historiqueEnvois() {
    const notifications = await this.notifications.find({
      where: { typeRappel: TYPE_RAPPEL_MANUEL },
      relations: {
        utilisateur: true,
        creePar: true,
        obligation: { typeImpot: true },
      },
      order: { creeLe: "DESC" },
      take: 200,
    });
    return notifications.map((notification) => ({
      id: notification.id,
      titre: notification.titre,
      message: notification.message,
      dateEnvoi: notification.creeLe,
      destinataire: {
        nom: notification.utilisateur?.nom ?? "—",
        courriel: notification.utilisateur?.courriel ?? "—",
      },
      dossier: {
        id: notification.obligation?.id ?? null,
        reference: notification.obligation?.referenceFiscale ?? "—",
      },
      initiePar: notification.creePar?.nom ?? "—",
      statutCourriel: notification.statutCourriel,
      tentativesCourriel: notification.tentativesCourriel,
      derniereErreurCourriel: notification.derniereErreurCourriel,
    }));
  }
}

/** Rendu du modèle avec variables par destinataire (aucune donnée croisée). */
export function rendreMessage(
  modele: string,
  variables: Record<string, string>,
): string {
  return modele.replace(/\{([a-zA-Z]+)\}/g, (entiere, cle: string) =>
    variables[cle] ?? entiere,
  );
}
