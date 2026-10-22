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
 * Reminder policy (initial parameters, NOT official tax rules):
 * days before due date and days overdue, configurable via
 * `RAPPELS_JOURS_AVANT` / `RAPPELS_JOURS_RETARD` (comma-separated lists).
 * Any change is an administrator's through configuration, never
 * hard-coded legal dates.
 */
export interface ReminderPolicy {
  daysBefore: number[];
  daysOverdue: number[];
  timeZone: string;
  maxEmailAttempts: number;
}

export const DEFAULT_TIMEZONE = "Indian/Antananarivo";

/**
 * Statuses eligible for a reminder: the obligation is neither
 * settled (PAYE) nor awaiting a decision on a filed declaration
 * (PAIEMENT_EN_COURS / EN_VERIFICATION — a declared payment is never
 * presented as confirmed, but no reminder is sent during review).
 * REJETE / CORRECTION_DEMANDEE become due again after an unfavorable decision.
 */
export const REMINDER_ELIGIBLE_STATUSES: ObligationStatus[] = [
  ObligationStatus.TO_PAY,
  ObligationStatus.OVERDUE,
  ObligationStatus.REJECTED,
  ObligationStatus.CORRECTION_REQUESTED,
];

/** Civil date (year/month/day) of an instant in a given time zone. */
export function civilDateInTimezone(
  instant: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/**
 * Number of civil days between "today" (in the business time zone) and the
 * due date `YYYY-MM-DD` stored in the database. Positive = upcoming,
 * 0 = today, negative = past. Working with civil dates avoids the
 * one-day shift around midnight between UTC and the local time zone.
 */
export function daysUntilDeadline(
  dueDate: string,
  now: Date,
  timeZone: string,
): number {
  const [year, month, day] = dueDate.slice(0, 10).split("-").map(Number);
  const aujourdHui = civilDateInTimezone(now, timeZone);
  const msPerDay = 86_400_000;
  const target = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const reference = Date.UTC(
    aujourdHui.year,
    aujourdHui.month - 1,
    aujourdHui.day,
  );
  return Math.round((target - reference) / msPerDay);
}

/** Type de rappel applicable aujourd'hui, ou `null` si aucun. */
export function determineReminderType(
  remainingDays: number,
  policy: ReminderPolicy,
): string | null {
  if (remainingDays > 0)
    return policy.daysBefore.includes(remainingDays)
      ? `AVANT_${remainingDays}`
      : null;
  if (remainingDays === 0)
    return policy.daysBefore.includes(0) ? "JOUR_J" : null;
  const overdue = Math.abs(remainingDays);
  return policy.daysOverdue.includes(overdue) ? `RETARD_${overdue}` : null;
}

export function reminderContent(
  reminderType: string,
  labelObligation: string,
  dueDate: string,
): { title: string; message: string } {
  const date = dueDate.slice(0, 10);
  if (reminderType === "JOUR_J")
    return {
      title: "Échéance fiscale aujourd'hui",
      message: `La date limite indiquée pour ${labelObligation} est aujourd'hui, ${date}. Consultez votre dossier pour vérifier son statut.`,
    };
  if (reminderType.startsWith("RETARD"))
    return {
      title: "Échéance fiscale dépassée",
      message: `D'après le statut actuel de votre dossier, l'échéance ${labelObligation} du ${date} n'est pas marquée comme réglée. Consultez votre espace pour vérifier la situation.`,
    };
  return {
    title: "Échéance fiscale à venir",
    message: `Votre échéance ${labelObligation} est prévue le ${date}. Consultez votre espace pour vérifier les informations et les démarches nécessaires.`,
  };
}

function parseDayList(
  value: string | undefined,
  defaultValue: number[],
): number[] {
  if (!value) return defaultValue;
  const days = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter(
      (count) => Number.isInteger(count) && count >= 0 && count <= 365,
    );
  return days.length > 0 ? [...new Set(days)] : defaultValue;
}

export interface ReminderRunSummary {
  examinedObligations: number;
  createdNotifications: number;
  sentEmails: number;
  failedEmails: number;
  alreadyExisting: number;
  withoutUserAccount: number;
}

@Injectable()
export class DeadlineReminderService {
  private readonly activityLog = new Logger(DeadlineReminderService.name);
  readonly policy: ReminderPolicy;

  constructor(
    @InjectRepository(ObligationEntity)
    private readonly obligations: Repository<ObligationEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @Inject(MAIL_SERVICE) private readonly email: MailSender,
    configuration: ConfigService,
  ) {
    this.policy = {
      daysBefore: parseDayList(
        configuration.get<string>("RAPPELS_JOURS_AVANT"),
        [7, 3, 1, 0],
      ),
      daysOverdue: parseDayList(
        configuration.get<string>("RAPPELS_JOURS_RETARD"),
        [1, 3, 7],
      ),
      timeZone: configuration.get<string>(
        "FUSEAU_HORAIRE",
        DEFAULT_TIMEZONE,
      ),
      maxEmailAttempts: Math.max(
        1,
        Number(
          configuration.get<string>("RAPPELS_TENTATIVES_COURRIEL_MAX", "3"),
        ) || 3,
      ),
    };
  }

  /**
   * Evaluates obligations and creates today's reminders. Idempotent:
   * the unique user+obligation+type key prevents any duplicate, even on
   * double execution or two concurrent instances (the losing concurrent
   * insert is ignored, PostgreSQL code 23505).
   * `now` is injectable to test dates without waiting for the calendar.
   */
  async processReminders(now: Date = new Date()): Promise<ReminderRunSummary> {
    const summary: ReminderRunSummary = {
      examinedObligations: 0,
      createdNotifications: 0,
      sentEmails: 0,
      failedEmails: 0,
      alreadyExisting: 0,
      withoutUserAccount: 0,
    };
    const obligations = await this.obligations.find({
      where: { status: In(REMINDER_ELIGIBLE_STATUSES) },
      relations: { taxpayer: { user: true }, taxType: true },
      take: 500, // bounded batch; later runs process the rest
    });
    summary.examinedObligations = obligations.length;

    for (const obligation of obligations) {
      const user = obligation.taxpayer?.user;
      if (!user) {
        summary.withoutUserAccount += 1;
        continue;
      }
      const days = daysUntilDeadline(
        obligation.dueDate,
        now,
        this.policy.timeZone,
      );
      const reminderType = determineReminderType(days, this.policy);
      if (!reminderType) continue;

      const idempotencyKey = `${user.id}:${obligation.id}:${reminderType}`;
      const existing = await this.notifications.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        summary.alreadyExisting += 1;
        // Bounded retry of an e-mail already failed, without recreating the in-app one.
        if (
          existing.emailStatus === NotificationEmailStatus.FAILED &&
          existing.emailAttempts < this.policy.maxEmailAttempts
        ) {
          await this.trySendEmail(existing, obligation, summary);
        }
        continue;
      }

      const label = `${obligation.taxType?.name ?? "Obligation"} · ${obligation.period} (${obligation.taxReference})`;
      const content = reminderContent(reminderType, label, obligation.dueDate);
      const notification = this.notifications.create({
        user,
        obligation,
        reminderType,
        title: content.title,
        message: content.message,
        link: "/client/obligations",
        isRead: false,
        idempotencyKey,
        emailStatus: NotificationEmailStatus.PENDING,
        emailAttempts: 0,
        lastEmailError: null,
        emailSentAt: null,
      });
      try {
        await this.notifications.save(notification);
      } catch (error) {
        // Race between two instances: the unique constraint already created the row.
        if ((error as { code?: string }).code === "23505") {
          summary.alreadyExisting += 1;
          continue;
        }
        throw error;
      }
      summary.createdNotifications += 1;
      await this.trySendEmail(notification, obligation, summary);
    }

    this.activityLog.log(
      `Rappels d'échéances : ${JSON.stringify({ ...summary, fuseau: this.policy.timeZone })}`,
    );
    return summary;
  }

  /** Send attempt; a failure never erases the in-app notification. */
  private async trySendEmail(
    notification: NotificationEntity,
    obligation: ObligationEntity,
    summary: ReminderRunSummary,
  ): Promise<void> {
    const recipient = obligation.taxpayer?.email ?? "";
    notification.emailAttempts += 1;
    if (!isValidEmail(recipient)) {
      notification.emailStatus = NotificationEmailStatus.FAILED;
      notification.lastEmailError =
        "Adresse e-mail absente ou invalide.";
      summary.failedEmails += 1;
      await this.notifications.save(notification);
      return;
    }
    try {
      const base = process.env.APP_URL ?? "http://localhost:5173";
      await this.email.send({
        recipient,
        recipientName:
          obligation.taxpayer?.legalName ??
          obligation.taxpayer?.lastName,
        subject: notification.title,
        text: `${notification.message}\n\nConsulter mon espace : ${base}/client/obligations`,
        html: buildEmailHtml({
          recipientName:
            obligation.taxpayer?.legalName ??
            obligation.taxpayer?.lastName,
          title: notification.title,
          message: notification.message,
          appLink: `${base}/client/obligations`,
        }),
      });
      notification.emailStatus = NotificationEmailStatus.SENT;
      notification.emailSentAt = new Date();
      notification.lastEmailError = null;
      summary.sentEmails += 1;
    } catch (error) {
      notification.emailStatus = NotificationEmailStatus.FAILED;
      // Short technical message only: no secret, no full address logged.
      notification.lastEmailError =
        error instanceof Error
          ? error.message.slice(0, 300)
          : "Échec d'envoi du courriel.";
      summary.failedEmails += 1;
      this.activityLog.warn(
        `Courriel de rappel en échec (obligation=${obligation.id}, notification=${notification.id}, tentative=${notification.emailAttempts})`,
      );
    }
    await this.notifications.save(notification);
  }
}
