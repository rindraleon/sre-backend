import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ObligationEntity } from "../database/entities/obligation.entity";
import {
  NotificationEntity,
  NotificationEmailStatus,
} from "../database/entities/notification.entity";
import { ObligationStatus } from "../database/enums";
import {
  buildEmailHtml,
  isValidEmail,
  MAIL_SERVICE,
  type MailSender,
} from "./mail.service";

/**
 * Politique de rappels (paramètres initiaux, PAS des règles fiscales
 * officielles) : jours avant échéance et jours de retard, configurables par
 * `RAPPELS_JOURS_AVANT` / `RAPPELS_JOURS_RETARD` (listes séparées par virgule).
 * Toute évolution relève d'un administrateur via la configuration, jamais de
 * dates légales codées en dur.
 */
export interface ReminderPolicy {
  joursAvant: number[];
  joursRetard: number[];
  fuseauHoraire: string;
  tentativesCourrielMax: number;
}

export const DEFAULT_TIMEZONE = "Indian/Antananarivo";

/**
 * Statuts pour lesquels un rappel est admissible : l'obligation n'est ni
 * réglée (PAYE), ni en attente de décision sur une déclaration déposée
 * (PAIEMENT_EN_COURS / EN_VERIFICATION — un paiement déclaré n'est jamais
 * présenté comme confirmé, mais on ne relance pas pendant la vérification).
 * REJETE / CORRECTION_DEMANDEE redeviennent dus après décision défavorable.
 */
export const REMINDER_ELIGIBLE_STATUSES: ObligationStatus[] = [
  ObligationStatus.A_PAYER,
  ObligationStatus.EN_RETARD,
  ObligationStatus.REJETE,
  ObligationStatus.CORRECTION_DEMANDEE,
];

/** Date civile (année/mois/jour) d'un instant dans un fuseau donné. */
export function civilDateInTimezone(
  instant: Date,
  fuseauHoraire: string,
): { annee: number; mois: number; jour: number } {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseauHoraire,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const lire = (type: string) =>
    Number(parties.find((partie) => partie.type === type)?.value ?? "0");
  return { annee: lire("year"), mois: lire("month"), jour: lire("day") };
}

/**
 * Nombre de jours civils entre « aujourd'hui » (dans le fuseau métier) et la
 * date d'échéance `AAAA-MM-JJ` stockée en base. Positif = à venir,
 * 0 = aujourd'hui, négatif = dépassée. Travailler en dates civiles évite le
 * décalage d'un jour autour de minuit entre UTC et le fuseau local.
 */
export function daysUntilDeadline(
  echeance: string,
  maintenant: Date,
  fuseauHoraire: string,
): number {
  const [annee, mois, jour] = echeance.slice(0, 10).split("-").map(Number);
  const aujourdHui = civilDateInTimezone(maintenant, fuseauHoraire);
  const msJour = 86_400_000;
  const cible = Date.UTC(annee, (mois ?? 1) - 1, jour ?? 1);
  const reference = Date.UTC(
    aujourdHui.annee,
    aujourdHui.mois - 1,
    aujourdHui.jour,
  );
  return Math.round((cible - reference) / msJour);
}

/** Type de rappel applicable aujourd'hui, ou `null` si aucun. */
export function determineReminderType(
  joursRestants: number,
  politique: ReminderPolicy,
): string | null {
  if (joursRestants > 0)
    return politique.joursAvant.includes(joursRestants)
      ? `AVANT_${joursRestants}`
      : null;
  if (joursRestants === 0)
    return politique.joursAvant.includes(0) ? "JOUR_J" : null;
  const retard = Math.abs(joursRestants);
  return politique.joursRetard.includes(retard) ? `RETARD_${retard}` : null;
}

export function reminderContent(
  typeRappel: string,
  libelleObligation: string,
  echeance: string,
): { titre: string; message: string } {
  const date = echeance.slice(0, 10);
  if (typeRappel === "JOUR_J")
    return {
      titre: "Échéance fiscale aujourd'hui",
      message: `La date limite indiquée pour ${libelleObligation} est aujourd'hui, ${date}. Consultez votre dossier pour vérifier son statut.`,
    };
  if (typeRappel.startsWith("RETARD"))
    return {
      titre: "Échéance fiscale dépassée",
      message: `D'après le statut actuel de votre dossier, l'échéance ${libelleObligation} du ${date} n'est pas marquée comme réglée. Consultez votre espace pour vérifier la situation.`,
    };
  return {
    titre: "Échéance fiscale à venir",
    message: `Votre échéance ${libelleObligation} est prévue le ${date}. Consultez votre espace pour vérifier les informations et les démarches nécessaires.`,
  };
}

function analyserListeJours(
  valeur: string | undefined,
  defaut: number[],
): number[] {
  if (!valeur) return defaut;
  const jours = valeur
    .split(",")
    .map((entree) => Number(entree.trim()))
    .filter(
      (nombre) => Number.isInteger(nombre) && nombre >= 0 && nombre <= 365,
    );
  return jours.length > 0 ? [...new Set(jours)] : defaut;
}

export interface ReminderRunSummary {
  obligationsExaminees: number;
  notificationsCreees: number;
  courrielsEnvoyes: number;
  courrielsEchoues: number;
  dejaExistantes: number;
  sansCompteUtilisateur: number;
}

@Injectable()
export class DeadlineReminderService {
  private readonly journal = new Logger(DeadlineReminderService.name);
  readonly politique: ReminderPolicy;

  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @Inject(MAIL_SERVICE) private readonly courriel: MailSender,
    configuration: ConfigService,
  ) {
    this.politique = {
      joursAvant: analyserListeJours(
        configuration.get<string>("RAPPELS_JOURS_AVANT"),
        [7, 3, 1, 0],
      ),
      joursRetard: analyserListeJours(
        configuration.get<string>("RAPPELS_JOURS_RETARD"),
        [1, 3, 7],
      ),
      fuseauHoraire: configuration.get<string>(
        "FUSEAU_HORAIRE",
        DEFAULT_TIMEZONE,
      ),
      tentativesCourrielMax: Math.max(
        1,
        Number(
          configuration.get<string>("RAPPELS_TENTATIVES_COURRIEL_MAX", "3"),
        ) || 3,
      ),
    };
  }

  /**
   * Évalue les obligations et crée les rappels du jour. Idempotent :
   * la clé unique utilisateur+obligation+type empêche tout doublon, même en
   * cas de double exécution ou de deux instances concurrentes (l'insertion
   * concurrente perdante est ignorée, code PostgreSQL 23505).
   * `maintenant` est injectable pour tester les dates sans attendre le calendrier.
   */
  async traiter(maintenant: Date = new Date()): Promise<ReminderRunSummary> {
    const bilan: ReminderRunSummary = {
      obligationsExaminees: 0,
      notificationsCreees: 0,
      courrielsEnvoyes: 0,
      courrielsEchoues: 0,
      dejaExistantes: 0,
      sansCompteUtilisateur: 0,
    };
    const obligations = await this.obligations.find({
      where: { statut: In(REMINDER_ELIGIBLE_STATUSES) },
      relations: { contribuable: { utilisateur: true }, typeImpot: true },
      take: 500, // lot borné ; les exécutions suivantes traitent la suite
    });
    bilan.obligationsExaminees = obligations.length;

    for (const obligation of obligations) {
      const utilisateur = obligation.contribuable?.utilisateur;
      if (!utilisateur) {
        bilan.sansCompteUtilisateur += 1;
        continue;
      }
      const jours = daysUntilDeadline(
        obligation.echeance,
        maintenant,
        this.politique.fuseauHoraire,
      );
      const typeRappel = determineReminderType(jours, this.politique);
      if (!typeRappel) continue;

      const cleIdempotence = `${utilisateur.id}:${obligation.id}:${typeRappel}`;
      const existante = await this.notifications.findOne({
        where: { cleIdempotence },
      });
      if (existante) {
        bilan.dejaExistantes += 1;
        // Relance bornée d'un courriel déjà en échec, sans recréer l'in-app.
        if (
          existante.statutCourriel === NotificationEmailStatus.ECHEC &&
          existante.tentativesCourriel < this.politique.tentativesCourrielMax
        ) {
          await this.tenterCourriel(existante, obligation, bilan);
        }
        continue;
      }

      const libelle = `${obligation.typeImpot?.nom ?? "Obligation"} · ${obligation.periode} (${obligation.referenceFiscale})`;
      const contenu = reminderContent(typeRappel, libelle, obligation.echeance);
      const notification = this.notifications.create({
        utilisateur,
        obligation,
        typeRappel,
        titre: contenu.titre,
        message: contenu.message,
        lien: "/client/obligations",
        lue: false,
        cleIdempotence,
        statutCourriel: NotificationEmailStatus.EN_ATTENTE,
        tentativesCourriel: 0,
        derniereErreurCourriel: null,
        courrielEnvoyeLe: null,
      });
      try {
        await this.notifications.save(notification);
      } catch (erreur) {
        // Course entre deux instances : la contrainte unique a déjà créé la ligne.
        if ((erreur as { code?: string }).code === "23505") {
          bilan.dejaExistantes += 1;
          continue;
        }
        throw erreur;
      }
      bilan.notificationsCreees += 1;
      await this.tenterCourriel(notification, obligation, bilan);
    }

    this.journal.log(
      `Rappels d'échéances : ${JSON.stringify({ ...bilan, fuseau: this.politique.fuseauHoraire })}`,
    );
    return bilan;
  }

  /** Tentative d'envoi ; l'échec n'efface jamais la notification in-app. */
  private async tenterCourriel(
    notification: NotificationEntity,
    obligation: ObligationEntity,
    bilan: ReminderRunSummary,
  ): Promise<void> {
    const destinataire = obligation.contribuable?.courriel ?? "";
    notification.tentativesCourriel += 1;
    if (!isValidEmail(destinataire)) {
      notification.statutCourriel = NotificationEmailStatus.ECHEC;
      notification.derniereErreurCourriel =
        "Adresse e-mail absente ou invalide.";
      bilan.courrielsEchoues += 1;
      await this.notifications.save(notification);
      return;
    }
    try {
      const base = process.env.APP_URL ?? "http://localhost:5173";
      await this.courriel.envoyer({
        destinataire,
        nomDestinataire:
          obligation.contribuable?.raisonSociale ??
          obligation.contribuable?.nom,
        sujet: notification.titre,
        texte: `${notification.message}\n\nConsulter mon espace : ${base}/client/obligations`,
        html: buildEmailHtml({
          nomDestinataire:
            obligation.contribuable?.raisonSociale ??
            obligation.contribuable?.nom,
          titre: notification.titre,
          message: notification.message,
          lienApplication: `${base}/client/obligations`,
        }),
      });
      notification.statutCourriel = NotificationEmailStatus.ENVOYE;
      notification.courrielEnvoyeLe = new Date();
      notification.derniereErreurCourriel = null;
      bilan.courrielsEnvoyes += 1;
    } catch (erreur) {
      notification.statutCourriel = NotificationEmailStatus.ECHEC;
      // Message technique court uniquement : aucun secret, aucune adresse complète journalisée.
      notification.derniereErreurCourriel =
        erreur instanceof Error
          ? erreur.message.slice(0, 300)
          : "Échec d'envoi du courriel.";
      bilan.courrielsEchoues += 1;
      this.journal.warn(
        `Courriel de rappel en échec (obligation=${obligation.id}, notification=${notification.id}, tentative=${notification.tentativesCourriel})`,
      );
    }
    await this.notifications.save(notification);
  }
}
