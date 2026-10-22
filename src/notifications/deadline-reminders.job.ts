import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import {
  DEFAULT_TIMEZONE,
  DeadlineReminderService,
} from "./deadline-reminders.service";

/**
 * Scheduled deadline-reminder job: once a day at 06:00 in the
 * business time zone (Indian/Antananarivo by default, `FUSEAU_HORAIRE`).
 * - Can be toggled with `RAPPELS_ACTIFS=false` (disabled in tests).
 * - No GET or page load ever triggers a send.
 * - Re-runnable without duplicates: unique idempotency key in the database, so two
 *   concurrent instances do not create two notifications.
 */
@Injectable()
export class DeadlineReminderJob {
  private readonly activityLog = new Logger(DeadlineReminderJob.name);
  private inProgress = false;

  constructor(
    private readonly reminders: DeadlineReminderService,
    private readonly configuration: ConfigService,
  ) {}

  @Cron("0 6 * * *", {
    name: "rappels-echeances-quotidien",
    timeZone: DEFAULT_TIMEZONE,
  })
  async execute(): Promise<void> {
    if (this.configuration.get<string>("RAPPELS_ACTIFS", "true") === "false")
      return;
    if (process.env.NODE_ENV === "test") return;
    if (this.inProgress) {
      this.activityLog.warn(
        "Job de rappels déjà en cours sur cette instance : exécution ignorée.",
      );
      return;
    }
    this.inProgress = true;
    try {
      const summary = await this.reminders.processReminders(new Date());
      this.activityLog.log(
        `Job rappels terminé (fuseau ${this.configuration.get<string>("FUSEAU_HORAIRE", DEFAULT_TIMEZONE)}) : ${summary.createdNotifications} créée(s), ${summary.sentEmails} courriel(s) envoyé(s), ${summary.failedEmails} échec(s).`,
      );
    } catch (error) {
      this.activityLog.error(
        `Job de rappels en échec : ${error instanceof Error ? error.message : "erreur inconnue"}`,
      );
    } finally {
      this.inProgress = false;
    }
  }
}
