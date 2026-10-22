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

/** History entry type of manual overdue-notification campaigns. */
export const MANUAL_REMINDER_TYPE = "RETARD_MANUEL";

/**
 * Situation of a record with regard to overdue — distinct tracking
 * categories: settled, under review (special handling), rejected,
 * correction requested, overdue or pending.
 */
export type OverdueSituation =
  | "REGULARISE"
  | "EN_VERIFICATION"
  | "REJETE"
  | "CORRECTION_DEMANDEE"
  | "EN_RETARD"
  | "EN_ATTENTE";

export interface OverdueRow {
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
  situation: OverdueSituation;
  entite: {
    id: string;
    nom: string;
    type: string;
    stat: string | null;
    nif: string | null;
    courriel: string | null;
  };
}

export interface RecipientResult {
  obligationId: string;
  destinataire: string;
  reference: string;
  resultat: "ENVOYEE" | "DEJA_ENVOYEE" | "IGNOREE" | "SANS_COMPTE" | "ECHEC";
  statutCourriel: NotificationEmailStatus;
  erreur?: string;
}

export interface CampaignSummary {
  totalSelectionnes: number;
  notificationsCreees: number;
  dejaEnvoyees: number;
  ignorees: number;
  sansCompte: number;
  echecs: number;
  courrielsEnvoyes: number;
  courrielsNonConfigures: number;
  details: RecipientResult[];
}

export function deriveSituationFromStatus(
  status: ObligationStatus,
  remainingDays: number,
): OverdueSituation {
  if (status === ObligationStatus.PAID) return "REGULARISE";
  if (
    status === ObligationStatus.UNDER_REVIEW ||
    status === ObligationStatus.PAYMENT_IN_PROGRESS
  )
    return "EN_VERIFICATION";
  if (status === ObligationStatus.REJECTED) return "REJETE";
  if (status === ObligationStatus.CORRECTION_REQUESTED)
    return "CORRECTION_DEMANDEE";
  return remainingDays < 0 ? "EN_RETARD" : "EN_ATTENTE";
}

function entityName(taxpayer: {
  legalName?: string | null;
  name?: string;
  firstName?: string | null;
}): string {
  return (
    taxpayer.legalName?.trim() ||
    `${taxpayer.firstName ?? ""} ${taxpayer.name ?? ""}`.trim() ||
    "Contribuable"
  );
}

/**
 * Overdue tracking and bulk notification campaigns (administration).
 *
 * - The overdue list is computed from due dates and recorded
 *   statuses; settled records are excluded by default.
 * - A campaign creates one notification per recipient (in-app + e-mail if
 *   a transport is configured), renders the message from a shared template
 *   without ever mixing two entities' data, refuses same-day
 *   duplicates (idempotency key) and reports partial failures.
 * - The "DELIVRE" status is never set: no mail provider
 *   confirms delivery within the current scope.
 */
@Injectable()
export class CampaignService {
  private readonly activityLog = new Logger(CampaignService.name);

  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @Inject(MAIL_SERVICE) private readonly email: MailSender,
    private readonly configuration: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.configuration.get<string>("FUSEAU_HORAIRE", DEFAULT_TIMEZONE);
  }

  async listOverdue(options: {
    search?: string;
    situation?: string;
    type?: string;
    includeSettled?: boolean;
  }): Promise<OverdueRow[]> {
    const now = new Date();
    const request = this.obligations
      .createQueryBuilder("obligation")
      .innerJoinAndSelect("obligation.taxpayer", "taxpayer")
      .innerJoinAndSelect("obligation.taxType", "taxType")
      .where("taxpayer.region = :region", { region: SRE_REGION });

    if (options.type) {
      request.andWhere("taxpayer.type = :type", { type: options.type });
    }
    if (options.search?.trim()) {
      const pattern = `%${options.search.trim().toLowerCase()}%`;
      request.andWhere(
        `(LOWER(taxpayer.lastName) LIKE :pattern
          OR LOWER(COALESCE(taxpayer.firstName, '')) LIKE :pattern
          OR LOWER(COALESCE(taxpayer.legalName, '')) LIKE :pattern
          OR LOWER(COALESCE(taxpayer.stat, '')) LIKE :pattern
          OR LOWER(obligation.taxReference) LIKE :pattern)`,
        { pattern },
      );
    }

    const rows = (await request.getMany()).map((obligation) => {
      const remainingDays = daysUntilDeadline(
        obligation.dueDate,
        now,
        this.timeZone,
      );
      const situation = deriveSituationFromStatus(obligation.status, remainingDays);
      return {
        obligationId: obligation.id,
        referenceFiscale: obligation.taxReference,
        periode: obligation.period,
        typeImpot: obligation.taxType?.name ?? "Obligation",
        montant: obligation.amount,
        devise: obligation.currency,
        echeance: obligation.dueDate.slice(0, 10),
        joursRestants: remainingDays,
        joursRetard: Math.max(0, -remainingDays),
        statut: obligation.status,
        situation,
        entite: {
          id: obligation.taxpayer.id,
          nom: entityName(obligation.taxpayer),
          type: obligation.taxpayer.type,
          stat: obligation.taxpayer.stat ?? null,
          nif: obligation.taxpayer.nif ?? null,
          courriel: obligation.taxpayer.email ?? null,
        },
      } satisfies OverdueRow;
    });

    return rows
      .filter((row) => row.joursRestants <= 0)
      .filter((row) =>
        options.includeSettled ? true : row.situation !== "REGULARISE",
      )
      .filter((row) =>
        options.situation ? row.situation === options.situation : true,
      )
      .sort((a, b) => b.joursRetard - a.joursRetard);
  }

  /**
   * Bulk send: each recipient gets their own rendering of the template.
   * Settled records are excluded; same-day duplicates are
   * reported without recreating a notification; failures are detailed.
   */
  async sendCampaign(
    administrator: UserEntity,
    obligationIds: string[],
    messageTemplate: string,
    title?: string,
  ): Promise<CampaignSummary> {
    const summary: CampaignSummary = {
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
    const now = new Date();
    const { year, month, day } = civilDateInTimezone(
      now,
      this.timeZone,
    );
    const campaignDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const transportConfigure = Boolean(
      this.configuration.get<string>("MAIL_TRANSPORT", "").trim(),
    );

    const obligations = await this.obligations
      .createQueryBuilder("obligation")
      .innerJoinAndSelect("obligation.taxpayer", "taxpayer")
      .innerJoinAndSelect("obligation.taxType", "taxType")
      .leftJoinAndSelect("taxpayer.user", "user")
      .where("obligation.id IN (:...ids)", { ids: obligationIds })
      .andWhere("taxpayer.region = :region", { region: SRE_REGION })
      .getMany();

    for (const obligation of obligations) {
      const entity = entityName(obligation.taxpayer);
      const reference = obligation.taxReference;
      const user = obligation.taxpayer?.user;
      const base: Omit<RecipientResult, "resultat" | "statutCourriel"> = {
        obligationId: obligation.id,
        destinataire: entity,
        reference,
      };

      // Settled records never receive an overdue reminder.
      if (obligation.status === ObligationStatus.PAID) {
        summary.ignorees += 1;
        summary.details.push({
          ...base,
          resultat: "IGNOREE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Dossier régularisé — rappel exclu.",
        });
        continue;
      }
      if (!user) {
        summary.sansCompte += 1;
        summary.details.push({
          ...base,
          resultat: "SANS_COMPTE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Aucun compte utilisateur lié à cette entité.",
        });
        continue;
      }

      const idempotencyKey = `${MANUAL_REMINDER_TYPE}:${obligation.id}:${campaignDate}`;
      const existing = await this.notifications.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        summary.dejaEnvoyees += 1;
        summary.details.push({
          ...base,
          resultat: "DEJA_ENVOYEE",
          statutCourriel: existing.emailStatus,
          erreur: "Notification déjà envoyée aujourd'hui pour ce dossier.",
        });
        continue;
      }

      const remainingDays = daysUntilDeadline(
        obligation.dueDate,
        now,
        this.timeZone,
      );
      const output = renderMessage(messageTemplate, {
        nom: entity,
        reference,
        periode: obligation.period,
        typeImpot: obligation.taxType?.name ?? "Obligation",
        echeance: obligation.dueDate.slice(0, 10),
        joursRetard: String(Math.max(0, -remainingDays)),
        montant: `${obligation.amount} ${obligation.currency}`,
      });

      let emailStatus = NotificationEmailStatus.NON_CONFIGURE;
      if (!transportConfigure) {
        emailStatus = NotificationEmailStatus.NON_CONFIGURE;
      }

      const notification = this.notifications.create({
        user,
        obligation,
        createdBy: administrator,
        reminderType: MANUAL_REMINDER_TYPE,
        title: title?.trim() || "Notification de retard — dossier fiscal",
        message: output,
        link: "/client/obligations",
        isRead: false,
        idempotencyKey,
        emailStatus,
        emailAttempts: 0,
        lastEmailError: null,
        emailSentAt: null,
      });

      try {
        await this.notifications.save(notification);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          summary.dejaEnvoyees += 1;
          summary.details.push({
            ...base,
            resultat: "DEJA_ENVOYEE",
            statutCourriel: NotificationEmailStatus.PENDING,
            erreur: "Envoi concurrent détecté — notification déjà créée.",
          });
          continue;
        }
        summary.echecs += 1;
        summary.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.FAILED,
          erreur:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Échec d'enregistrement.",
        });
        continue;
      }
      summary.notificationsCreees += 1;

      // E-mail: never announced as sent without a real attempt.
      if (!transportConfigure) {
        summary.courrielsNonConfigures += 1;
        summary.details.push({
          ...base,
          resultat: "ENVOYEE",
          statutCourriel: NotificationEmailStatus.NON_CONFIGURE,
          erreur: "Aucun transport de courriel configuré — notification in-app créée.",
        });
        continue;
      }
      const recipientEmail = obligation.taxpayer?.email ?? "";
      if (!isValidEmail(recipientEmail)) {
        notification.emailStatus = NotificationEmailStatus.FAILED;
        notification.emailAttempts = 1;
        notification.lastEmailError =
          "Adresse e-mail absente ou invalide.";
        await this.notifications.save(notification);
        summary.echecs += 1;
        summary.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.FAILED,
          erreur: "Adresse e-mail absente ou invalide.",
        });
        continue;
      }

      notification.emailAttempts += 1;
      try {
        const appUrl = this.configuration.get<string>(
          "APP_URL",
          "http://localhost:5173",
        );
        await this.email.send({
          recipient: recipientEmail,
          recipientName: entity,
          subject: notification.title,
          text: `${output}\n\nConsulter mon espace : ${appUrl}/client/obligations`,
          html: buildEmailHtml({
            recipientName: entity,
            title: notification.title,
            message: output,
            appLink: `${appUrl}/client/obligations`,
          }),
        });
        notification.emailStatus = NotificationEmailStatus.SENT;
        notification.emailSentAt = new Date();
        notification.lastEmailError = null;
        summary.courrielsEnvoyes += 1;
        await this.notifications.save(notification);
        summary.details.push({
          ...base,
          resultat: "ENVOYEE",
          statutCourriel: NotificationEmailStatus.SENT,
        });
      } catch (error) {
        notification.emailStatus = NotificationEmailStatus.FAILED;
        notification.lastEmailError = (
          error instanceof Error
            ? error.message
            : "Échec d'envoi du courriel."
        ).slice(0, 300);
        await this.notifications.save(notification);
        summary.echecs += 1;
        summary.details.push({
          ...base,
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.FAILED,
          erreur: notification.lastEmailError ?? undefined,
        });
        this.activityLog.warn(
          `Courriel de campagne en échec (notification=${notification.id}, obligation=${obligation.id})`,
        );
      }
    }

    // Selected records missing from the scope or not found.
    const processed = new Set(obligations.map((obligation) => obligation.id));
    for (const id of obligationIds) {
      if (!processed.has(id)) {
        summary.echecs += 1;
        summary.details.push({
          obligationId: id,
          destinataire: "—",
          reference: "—",
          resultat: "ECHEC",
          statutCourriel: NotificationEmailStatus.FAILED,
          erreur: "Dossier introuvable dans le périmètre du service.",
        });
      }
    }

    this.activityLog.log(`Campagne de notifications : ${JSON.stringify({
      total: summary.totalSelectionnes,
      creees: summary.notificationsCreees,
      dejaEnvoyees: summary.dejaEnvoyees,
      ignorees: summary.ignorees,
      echecs: summary.echecs,
    })}`);
    return summary;
  }

  /** History of manual campaigns (recipient, record, author, status). */
  async dispatchHistory() {
    const notifications = await this.notifications.find({
      where: { reminderType: MANUAL_REMINDER_TYPE },
      relations: {
        user: true,
        createdBy: true,
        obligation: { taxType: true },
      },
      order: { createdAt: "DESC" },
      take: 200,
    });
    return notifications.map((notification) => ({
      id: notification.id,
      titre: notification.title,
      message: notification.message,
      dateEnvoi: notification.createdAt,
      destinataire: {
        nom: notification.user?.name ?? "—",
        courriel: notification.user?.email ?? "—",
      },
      dossier: {
        id: notification.obligation?.id ?? null,
        reference: notification.obligation?.taxReference ?? "—",
      },
      initiePar: notification.createdBy?.name ?? "—",
      statutCourriel: notification.emailStatus,
      tentativesCourriel: notification.emailAttempts,
      derniereErreurCourriel: notification.lastEmailError,
    }));
  }
}

/** Renders the template with per-recipient variables (no crossed data). */
export function renderMessage(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) =>
    variables[key] ?? whole,
  );
}
