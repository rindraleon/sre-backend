import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  ContactEmailStatus,
  ContactMessageEntity,
  ContactMessageSource,
} from "../database/entities/contact-message.entity";
import {
  NotificationEmailStatus,
  NotificationEntity,
} from "../database/entities/notification.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import {
  buildAdminEventEmail,
  type EmailSummaryRow,
  sanitizeErrorMessage,
} from "./email-templates";
import { isValidEmail, MAIL_SERVICE, type MailSender } from "./mail.service";
import { DEFAULT_TIMEZONE } from "./deadline-reminders.service";

export interface AdminDispatchResult {
  status: ContactEmailStatus;
  attempts: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
}

/** Centralized service for automatic notifications sent to administrators (in-app notification center + automatic e. */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly mail: MailSender,
  ) {}

  private get timeZone(): string {
    return this.configuration.get<string>("FUSEAU_HORAIRE", DEFAULT_TIMEZONE);
  }

  private get appBaseUrl(): string {
    return (
      this.configuration
        .get<string>("APP_URL", "http://localhost:5173")
        .trim()
        .replace(/\/+$/, "") || "http://localhost:5173"
    );
  }

  private get isTransportConfigured(): boolean {
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .trim()
      .toLowerCase();
    return mode === "smtp" || mode === "capture";
  }

  private async getActiveAdministrators(): Promise<UserEntity[]> {
    return this.users.find({
      where: { role: AccountRole.ADMIN, status: AccountStatus.ACTIVE },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
  }

  /** Notifies all active administrators of a new contact message (from the public contact form or from a signed-in cl. */
  async notifyContactMessage(
    contactMessage: ContactMessageEntity,
  ): Promise<AdminDispatchResult> {
    const administrators = await this.getActiveAdministrators();
    if (!administrators.length) {
      const reason =
        "Aucun administrateur actif ne peut recevoir la notification.";
      this.logger.warn(
        `Notification admin non envoyée pour le message ${contactMessage.id} : ${reason}`,
      );
      return {
        status: ContactEmailStatus.FAILED,
        attempts: 0,
        sentCount: 0,
        failedCount: 1,
        lastError: reason,
      };
    }

    const reference =
      contactMessage.reference ?? `MSG-${contactMessage.id.slice(0, 8).toUpperCase()}`;
    const sourceLabel =
      contactMessage.source === ContactMessageSource.CLIENT_PORTAL
        ? "Espace client authentifié"
        : "Formulaire de contact public";
    const relativePath = `/admin/messages-contact?messageId=${encodeURIComponent(contactMessage.id)}`;
    const adminUrl = `${this.appBaseUrl}${relativePath}`;

    let sentCount = 0;
    let failedCount = 0;
    let attempts = 0;
    const errors: string[] = [];

    for (const admin of administrators) {
      const idempotencyKey = `ADMIN_CONTACT:${contactMessage.id}:${admin.id}`;
      const result = await this.dispatchToAdmin({
        admin,
        idempotencyKey,
        reminderType: "CONTACT_PUBLIC",
        title: `Nouveau message de contact : ${contactMessage.subject.slice(0, 100)}`,
        inAppMessage: `${contactMessage.name} (${contactMessage.email}) a envoyé un message via ${sourceLabel.toLowerCase()} : « ${contactMessage.subject} » (réf. ${reference}).`,
        link: relativePath,
        emailSubject: `[Contact SRE · ${reference}] ${contactMessage.subject}`,
        replyTo: isValidEmail(contactMessage.email)
          ? contactMessage.email
          : undefined,
        actionType: `Nouveau message (${sourceLabel})`,
        actorName: contactMessage.name,
        actorEmail: contactMessage.email,
        reference,
        submittedAt: contactMessage.createdAt ?? new Date(),
        summaryRows: [
          { label: "Origine", value: sourceLabel },
          { label: "Sujet", value: contactMessage.subject },
        ],
        contentTitle: "Message reçu",
        contentBody: contactMessage.message,
        adminUrl,
        adminLinkLabel: "Ouvrir et répondre dans la messagerie",
      });

      attempts += result.attempted ? 1 : 0;
      if (result.emailStatus === NotificationEmailStatus.SENT) {
        sentCount += 1;
      } else if (result.emailStatus === NotificationEmailStatus.FAILED) {
        failedCount += 1;
        if (result.error) errors.push(result.error);
      }
    }

    if (!this.isTransportConfigured) {
      this.logger.log(
        `Notification in-app créée pour le message ${reference} (transport e-mail non configuré).`,
      );
      return {
        status: ContactEmailStatus.NON_CONFIGURE,
        attempts,
        sentCount: 0,
        failedCount: 0,
        lastError: null,
      };
    }

    if (sentCount > 0) {
      this.logger.log(
        `Notification e-mail administrateur envoyée pour le message ${reference} (${sentCount}/${administrators.length} destinataire(s)).`,
      );
      return {
        status: ContactEmailStatus.SENT,
        attempts: Math.max(1, attempts),
        sentCount,
        failedCount,
        lastError: null,
      };
    }

    const lastError = errors.length
      ? errors.join(" | ").slice(0, 280)
      : "Échec d'envoi du courriel de notification.";
    this.logger.error(
      `Échec d'envoi de la notification administrateur pour le message ${reference} : ${lastError}`,
    );
    return {
      status: ContactEmailStatus.FAILED,
      attempts: Math.max(1, attempts),
      sentCount: 0,
      failedCount,
      lastError,
    };
  }

  /** Notifies all active administrators when a connected client submits a payment declaration requiring administrativ. */
  async notifyPaymentDeclarationSubmitted(params: {
    paymentId: string;
    internalReference: string;
    obligation?: ObligationEntity | null;
    taxReference: string;
    taxTypeName: string;
    period: string;
    amount: string | number;
    currency: string;
    mode: string;
    transactionReference: string;
    submittedAt: Date;
    taxpayerName: string;
    taxpayerEmail?: string | null;
    taxpayerNif?: string | null;
  }): Promise<void> {
    try {
      const administrators = await this.getActiveAdministrators();
      if (!administrators.length) return;

      const relativePath = `/admin/paiements/${encodeURIComponent(params.paymentId)}`;
      const adminUrl = `${this.appBaseUrl}${relativePath}`;
      const formattedAmount = `${new Intl.NumberFormat("fr-FR").format(Number(params.amount))} ${params.currency}`;
      const modeLabel =
        params.mode === "MOBILE_MONEY" ? "Mobile Money" : "Virement bancaire";

      for (const admin of administrators) {
        const idempotencyKey = `ADMIN_PAYMENT:${params.paymentId}:${admin.id}`;
        await this.dispatchToAdmin({
          admin,
          obligation: params.obligation ?? null,
          idempotencyKey,
          reminderType: "DECLARATION_PAIEMENT",
          title: `Nouvelle déclaration à vérifier (${params.internalReference})`,
          inAppMessage: `${params.taxpayerName} a soumis une déclaration de paiement (${params.internalReference}) de ${formattedAmount} pour ${params.taxTypeName} (${params.period}). Statut : En vérification.`,
          link: relativePath,
          emailSubject: `[SRE · Vérification requise] Déclaration ${params.internalReference} — ${params.taxpayerName}`,
          replyTo: isValidEmail(params.taxpayerEmail)
            ? (params.taxpayerEmail ?? undefined)
            : undefined,
          actionType: "Soumission d'une déclaration de paiement",
          actorName: params.taxpayerName,
          actorEmail: params.taxpayerEmail,
          reference: params.internalReference,
          submittedAt: params.submittedAt,
          summaryRows: [
            ...(params.taxpayerNif
              ? [{ label: "NIF", value: params.taxpayerNif }]
              : []),
            { label: "Impôt / Taxe", value: params.taxTypeName },
            { label: "Période fiscale", value: params.period },
            { label: "Obligation liée", value: params.taxReference },
            { label: "Montant déclaré", value: formattedAmount },
            { label: "Mode déclaré", value: modeLabel },
            {
              label: "Référence de transaction",
              value: params.transactionReference,
            },
            { label: "Statut initial", value: "En vérification" },
          ],
          adminUrl,
          adminLinkLabel: "Examiner la déclaration dans le back-office",
        });
      }
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de la notification admin pour la déclaration ${params.internalReference} : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  /** Notifies active administrators when a new taxpayer/client registers on the portal. */
  async notifyClientRegistered(params: {
    userId: string;
    taxpayerId: string;
    name: string;
    email: string;
    taxpayerType: string;
    nif?: string | null;
    stat?: string | null;
    city: string;
    registeredAt?: Date;
  }): Promise<void> {
    try {
      const administrators = await this.getActiveAdministrators();
      if (!administrators.length) return;

      const isBusiness = params.taxpayerType === "ENTREPRISE";
      const relativePath = isBusiness
        ? `/admin/entreprises/${encodeURIComponent(params.taxpayerId)}`
        : `/admin/contribuables/${encodeURIComponent(params.taxpayerId)}`;
      const adminUrl = `${this.appBaseUrl}${relativePath}`;
      const reference =
        params.nif || params.stat || `CPT-${params.taxpayerId.slice(0, 8).toUpperCase()}`;

      for (const admin of administrators) {
        const idempotencyKey = `ADMIN_REGISTER:${params.userId}:${admin.id}`;
        await this.dispatchToAdmin({
          admin,
          idempotencyKey,
          reminderType: "INSCRIPTION_CLIENT",
          title: `Nouvelle inscription contribuable : ${params.name.slice(0, 90)}`,
          inAppMessage: `Un nouveau compte ${isBusiness ? "entreprise" : "particulier"} a été créé par ${params.name} (${params.email}) à ${params.city}.`,
          link: relativePath,
          emailSubject: `[SRE · Nouvelle inscription] ${params.name} (${isBusiness ? "Entreprise" : "Particulier"})`,
          actionType: "Création d'un compte contribuable",
          actorName: params.name,
          actorEmail: params.email,
          reference,
          submittedAt: params.registeredAt ?? new Date(),
          summaryRows: [
            {
              label: "Type de contribuable",
              value: isBusiness ? "Entreprise" : "Particulier",
            },
            ...(params.nif ? [{ label: "NIF", value: params.nif }] : []),
            ...(params.stat ? [{ label: "STAT", value: params.stat }] : []),
            { label: "Ville / Commune", value: params.city },
          ],
          adminUrl,
          adminLinkLabel: "Consulter la fiche contribuable",
        });
      }
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de la notification admin d'inscription (${params.userId}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  /** Notifies active administrators when a connected client updates their fiscal profile or completes their initial a. */
  async notifyClientProfileUpdated(params: {
    userId: string;
    taxpayerId: string;
    name: string;
    email: string;
    taxpayerType: string;
    nif?: string | null;
    actionLabel: string;
    summaryRows: EmailSummaryRow[];
    idempotencyToken: string;
    updatedAt?: Date;
  }): Promise<void> {
    try {
      const administrators = await this.getActiveAdministrators();
      if (!administrators.length) return;

      const isBusiness = params.taxpayerType === "ENTREPRISE";
      const relativePath = isBusiness
        ? `/admin/entreprises/${encodeURIComponent(params.taxpayerId)}`
        : `/admin/contribuables/${encodeURIComponent(params.taxpayerId)}`;
      const adminUrl = `${this.appBaseUrl}${relativePath}`;
      const reference =
        params.nif || `DOS-${params.taxpayerId.slice(0, 8).toUpperCase()}`;

      for (const admin of administrators) {
        const idempotencyKey = `ADMIN_PROFILE:${params.taxpayerId}:${params.idempotencyToken}:${admin.id}`;
        await this.dispatchToAdmin({
          admin,
          idempotencyKey,
          reminderType: "MISE_A_JOUR_PROFIL",
          title: `${params.actionLabel} : ${params.name.slice(0, 90)}`,
          inAppMessage: `${params.name} (${params.email}) a effectué l'action suivante : ${params.actionLabel.toLowerCase()}.`,
          link: relativePath,
          emailSubject: `[SRE · Suivi dossier] ${params.actionLabel} — ${params.name}`,
          actionType: params.actionLabel,
          actorName: params.name,
          actorEmail: params.email,
          reference,
          submittedAt: params.updatedAt ?? new Date(),
          summaryRows: params.summaryRows,
          adminUrl,
          adminLinkLabel: "Consulter le dossier contribuable",
        });
      }
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de la notification admin de mise à jour profil (${params.taxpayerId}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  private async dispatchToAdmin(options: {
    admin: UserEntity;
    obligation?: ObligationEntity | null;
    idempotencyKey: string;
    reminderType: string;
    title: string;
    inAppMessage: string;
    link: string;
    emailSubject: string;
    replyTo?: string;
    actionType: string;
    actorName: string;
    actorEmail?: string | null;
    reference?: string | null;
    submittedAt: Date;
    summaryRows: EmailSummaryRow[];
    contentTitle?: string;
    contentBody?: string;
    adminUrl: string;
    adminLinkLabel?: string;
  }): Promise<{
    notification: NotificationEntity | null;
    emailStatus: NotificationEmailStatus;
    attempted: boolean;
    error: string | null;
  }> {
    const transportConfigured = this.isTransportConfigured;
    let notification = await this.notifications.findOne({
      where: { idempotencyKey: options.idempotencyKey },
    });

    if (notification) {
      if (notification.emailStatus === NotificationEmailStatus.SENT) {
        this.logger.log(
          `Notification admin déjà envoyée (idempotence=${options.idempotencyKey}) — doublon évité.`,
        );
        return {
          notification,
          emailStatus: notification.emailStatus,
          attempted: false,
          error: null,
        };
      }
    } else {
      notification = this.notifications.create({
        user: options.admin,
        obligation: options.obligation ?? null,
        createdBy: null,
        reminderType: options.reminderType.slice(0, 48),
        title: options.title.slice(0, 160),
        message: options.inAppMessage,
        link: options.link.slice(0, 200),
        isRead: false,
        idempotencyKey: options.idempotencyKey.slice(0, 200),
        emailStatus: transportConfigured
          ? NotificationEmailStatus.PENDING
          : NotificationEmailStatus.NON_CONFIGURE,
        emailAttempts: 0,
        lastEmailError: null,
        emailSentAt: null,
      });
      try {
        notification = await this.notifications.save(notification);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          const existing = await this.notifications.findOne({
            where: { idempotencyKey: options.idempotencyKey },
          });
          return {
            notification: existing,
            emailStatus:
              existing?.emailStatus ?? NotificationEmailStatus.PENDING,
            attempted: false,
            error: null,
          };
        }
        throw error;
      }
    }

    if (!transportConfigured) {
      notification.emailStatus = NotificationEmailStatus.NON_CONFIGURE;
      await this.notifications.save(notification);
      return {
        notification,
        emailStatus: NotificationEmailStatus.NON_CONFIGURE,
        attempted: false,
        error: null,
      };
    }

    if (!isValidEmail(options.admin.email)) {
      const err = "Adresse e-mail de l'administrateur invalide.";
      notification.emailAttempts += 1;
      notification.emailStatus = NotificationEmailStatus.FAILED;
      notification.lastEmailError = err;
      await this.notifications.save(notification);
      return {
        notification,
        emailStatus: NotificationEmailStatus.FAILED,
        attempted: true,
        error: err,
      };
    }

    const { text, html } = buildAdminEventEmail({
      recipientName: options.admin.name,
      actionType: options.actionType,
      title: options.title,
      actorName: options.actorName,
      actorEmail: options.actorEmail,
      reference: options.reference,
      submittedAt: options.submittedAt,
      timeZone: this.timeZone,
      summaryRows: options.summaryRows,
      contentTitle: options.contentTitle,
      contentBody: options.contentBody,
      adminUrl: options.adminUrl,
      adminLinkLabel: options.adminLinkLabel,
    });

    notification.emailAttempts += 1;
    try {
      await this.mail.send({
        recipient: options.admin.email,
        recipientName: options.admin.name,
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        subject: options.emailSubject,
        text,
        html,
      });
      notification.emailStatus = NotificationEmailStatus.SENT;
      notification.emailSentAt = new Date();
      notification.lastEmailError = null;
      await this.notifications.save(notification);
      return {
        notification,
        emailStatus: NotificationEmailStatus.SENT,
        attempted: true,
        error: null,
      };
    } catch (error) {
      const sanitized = sanitizeErrorMessage(error);
      notification.emailStatus = NotificationEmailStatus.FAILED;
      notification.lastEmailError = sanitized;
      await this.notifications.save(notification);
      this.logger.warn(
        `Échec d'envoi du courriel admin (cle=${options.idempotencyKey}, tentative=${notification.emailAttempts}) : ${sanitized}`,
      );
      return {
        notification,
        emailStatus: NotificationEmailStatus.FAILED,
        attempted: true,
        error: sanitized,
      };
    }
  }
}
