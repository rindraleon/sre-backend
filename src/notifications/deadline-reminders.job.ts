import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import {
  DEFAULT_TIMEZONE,
  DeadlineReminderService,
} from "./deadline-reminders.service";

/**
 * Job planifié des rappels d'échéances : une fois par jour à 06:00 dans le
 * fuseau métier (Indian/Antananarivo par défaut, `FUSEAU_HORAIRE`).
 * - Activable/désactivable par `RAPPELS_ACTIFS=false` (désactivé en test).
 * - Aucun GET ni ouverture de page ne déclenche d'envoi.
 * - Relançable sans doublons : clé d'idempotence unique en base, donc deux
 *   instances concurrentes ne créent pas deux notifications.
 */
@Injectable()
export class DeadlineReminderJob {
  private readonly journal = new Logger(DeadlineReminderJob.name);
  private enCours = false;

  constructor(
    private readonly rappels: DeadlineReminderService,
    private readonly configuration: ConfigService,
  ) {}

  @Cron("0 6 * * *", {
    name: "rappels-echeances-quotidien",
    timeZone: DEFAULT_TIMEZONE,
  })
  async executer(): Promise<void> {
    if (this.configuration.get<string>("RAPPELS_ACTIFS", "true") === "false")
      return;
    if (process.env.NODE_ENV === "test") return;
    if (this.enCours) {
      this.journal.warn(
        "Job de rappels déjà en cours sur cette instance : exécution ignorée.",
      );
      return;
    }
    this.enCours = true;
    try {
      const bilan = await this.rappels.traiter(new Date());
      this.journal.log(
        `Job rappels terminé (fuseau ${this.configuration.get<string>("FUSEAU_HORAIRE", DEFAULT_TIMEZONE)}) : ${bilan.notificationsCreees} créée(s), ${bilan.courrielsEnvoyes} courriel(s) envoyé(s), ${bilan.courrielsEchoues} échec(s).`,
      );
    } catch (erreur) {
      this.journal.error(
        `Job de rappels en échec : ${erreur instanceof Error ? erreur.message : "erreur inconnue"}`,
      );
    } finally {
      this.enCours = false;
    }
  }
}
