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
import { PaymentStatus } from "../database/enums";
import {
  buildAcknowledgmentEmail,
  type EmailSummaryRow,
  sanitizeErrorMessage,
} from "./email-templates";
import { isValidEmail, MAIL_SERVICE, type MailSender } from "./mail.service";
import { DEFAULT_TIMEZONE } from "./deadline-reminders.service";

export interface ContactAckResult {
  status: ContactEmailStatus;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
}

/** Centralized service for automatic acknowledgment e-mails (accusés de réception) sent to visitors and connected c. */
@Injectable()
export class AcknowledgmentService {
  private readonly logger = new Logger(AcknowledgmentService.name);

  constructor(
    @InjectRepository(ContactMessageEntity)
    private readonly contactMessages: Repository<ContactMessageEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
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

  /** Sends an automatic acknowledgment e-mail to the visitor or client who submitted a contact message. */
  async sendContactAcknowledgment(
    contactMessage: ContactMessageEntity,
    forceRetry = false,
  ): Promise<ContactAckResult> {
    if (
      !forceRetry &&
      contactMessage.ackEmailStatus === ContactEmailStatus.SENT
    ) {
      this.logger.log(
        `Accusé de réception déjà envoyé pour le message ${contactMessage.reference ?? contactMessage.id} — doublon évité.`,
      );
      return {
        status: contactMessage.ackEmailStatus,
        attempts: contactMessage.ackEmailAttempts,
        lastError: contactMessage.lastAckEmailError,
        sentAt: contactMessage.ackEmailSentAt,
      };
    }

    const reference =
      contactMessage.reference ??
      `MSG-${contactMessage.id.slice(0, 8).toUpperCase()}`;

    if (!this.isTransportConfigured) {
      contactMessage.ackEmailStatus = ContactEmailStatus.NON_CONFIGURE;
      contactMessage.lastAckEmailError = null;
      await this.contactMessages.save(contactMessage);
      this.logger.log(
        `Accusé de réception non envoyé pour ${reference} : transport e-mail non configuré.`,
      );
      return {
        status: ContactEmailStatus.NON_CONFIGURE,
        attempts: contactMessage.ackEmailAttempts,
        lastError: null,
        sentAt: null,
      };
    }

    if (!isValidEmail(contactMessage.email)) {
      const err = "Adresse e-mail de l'expéditeur absente ou invalide.";
      contactMessage.ackEmailAttempts += 1;
      contactMessage.ackEmailStatus = ContactEmailStatus.FAILED;
      contactMessage.lastAckEmailError = err;
      await this.contactMessages.save(contactMessage);
      this.logger.warn(
        `Accusé de réception impossible pour ${reference} : ${err}`,
      );
      return {
        status: ContactEmailStatus.FAILED,
        attempts: contactMessage.ackEmailAttempts,
        lastError: err,
        sentAt: null,
      };
    }

    const messagePreview =
      contactMessage.message.length > 260
        ? `${contactMessage.message.slice(0, 260)}…`
        : contactMessage.message;

    const { text, html } = buildAcknowledgmentEmail({
      recipientName: contactMessage.name,
      title: "Accusé de réception de votre message de contact",
      confirmationIntro:
        "Nous vous confirmons que votre message a bien été reçu et enregistré par le portail du Service Régional des Entreprises.",
      reference,
      actionSummary:
        contactMessage.source === ContactMessageSource.CLIENT_PORTAL
          ? "Envoi d'un message de contact depuis l'espace client"
          : "Envoi d'un message depuis le formulaire de contact public",
      submittedAt: contactMessage.createdAt ?? new Date(),
      timeZone: this.timeZone,
      summaryRows: [
        { label: "Sujet de votre demande", value: contactMessage.subject },
        { label: "Résumé du message", value: messagePreview },
      ],
      nextSteps: [
        "Votre demande a été transmise aux administrateurs actifs du Service Régional des Entreprises.",
        `Une réponse vous sera adressée par courriel à l'adresse ${contactMessage.email} après examen de votre message.`,
        `Conservez votre numéro de référence (${reference}) pour tout échange ultérieur.`,
      ],
      appUrl: this.appBaseUrl,
      actionPath:
        contactMessage.source === ContactMessageSource.CLIENT_PORTAL
          ? "/client"
          : "/accueil",
      actionLabel:
        contactMessage.source === ContactMessageSource.CLIENT_PORTAL
          ? "Retourner à mon espace contribuable"
          : "Consulter le portail SRE",
    });

    contactMessage.ackEmailAttempts += 1;
    try {
      await this.mail.send({
        recipient: contactMessage.email,
        recipientName: contactMessage.name,
        subject: `[Portail SRE · ${reference}] Accusé de réception — ${contactMessage.subject}`,
        text,
        html,
      });
      contactMessage.ackEmailStatus = ContactEmailStatus.SENT;
      contactMessage.ackEmailSentAt = new Date();
      contactMessage.lastAckEmailError = null;
      await this.contactMessages.save(contactMessage);
      this.logger.log(
        `Accusé de réception envoyé avec succès pour le message ${reference} (tentative=${contactMessage.ackEmailAttempts}).`,
      );
      return {
        status: ContactEmailStatus.SENT,
        attempts: contactMessage.ackEmailAttempts,
        lastError: null,
        sentAt: contactMessage.ackEmailSentAt,
      };
    } catch (error) {
      const sanitized = sanitizeErrorMessage(error);
      contactMessage.ackEmailStatus = ContactEmailStatus.FAILED;
      contactMessage.lastAckEmailError = sanitized;
      await this.contactMessages.save(contactMessage);
      this.logger.error(
        `Échec d'envoi de l'accusé de réception pour le message ${reference} (tentative=${contactMessage.ackEmailAttempts}) : ${sanitized}`,
      );
      return {
        status: ContactEmailStatus.FAILED,
        attempts: contactMessage.ackEmailAttempts,
        lastError: sanitized,
        sentAt: null,
      };
    }
  }

  /** Sends an automatic acknowledgment e-mail (and creates an in-app notification) when a connected client submits a. */
  async sendPaymentDeclarationAcknowledgment(params: {
    userId: string;
    paymentId: string;
    internalReference: string;
    acknowledgmentNumber?: string | null;
    obligation?: ObligationEntity | null;
    taxReference: string;
    taxTypeName: string;
    period: string;
    amount: string | number;
    currency: string;
    mode: string;
    transactionReference: string;
    submittedAt: Date;
    recipientName: string;
    recipientEmail: string;
  }): Promise<void> {
    try {
      const user = await this.users.findOne({ where: { id: params.userId } });
      if (!user) return;

      const formattedAmount = `${new Intl.NumberFormat("fr-FR").format(Number(params.amount))} ${params.currency}`;
      const modeLabel =
        params.mode === "MOBILE_MONEY" ? "Mobile Money" : "Virement bancaire";
      const relativePath = `/client/paiements/${encodeURIComponent(params.paymentId)}`;

      await this.dispatchClientAcknowledgment({
        user,
        obligation: params.obligation ?? null,
        recipientEmail: params.recipientEmail,
        recipientName: params.recipientName,
        idempotencyKey: `CLIENT_ACK_PAYMENT:${params.paymentId}:${user.id}`,
        reminderType: "ACCUSE_DECLARATION",
        inAppTitle: `Accusé de réception — Déclaration ${params.internalReference}`,
        inAppMessage: `Votre déclaration de paiement ${params.internalReference} (${params.taxTypeName} · ${params.period}, montant déclaré : ${formattedAmount}) a bien été enregistrée et placée en statut « En vérification ».`,
        link: relativePath,
        emailSubject: `[Portail SRE · ${params.internalReference}] Accusé de réception de votre déclaration`,
        emailTitle: "Accusé de réception de votre déclaration de paiement",
        confirmationIntro:
          "Votre déclaration de paiement a bien été enregistrée sur le portail SRE et transmise à l'administration pour vérification.",
        reference: params.internalReference,
        actionSummary: "Soumission d'une déclaration de paiement à vérifier",
        submittedAt: params.submittedAt,
        summaryRows: [
          ...(params.acknowledgmentNumber
            ? [
                {
                  label: "Document d'accusé",
                  value: params.acknowledgmentNumber,
                },
              ]
            : []),
          { label: "Impôt / Taxe", value: params.taxTypeName },
          { label: "Période fiscale", value: params.period },
          { label: "Référence d'obligation", value: params.taxReference },
          { label: "Montant déclaré", value: formattedAmount },
          { label: "Mode de paiement déclaré", value: modeLabel },
          {
            label: "Référence de transaction",
            value: params.transactionReference,
          },
          { label: "Statut du dossier", value: "En vérification" },
        ],
        nextSteps: [
          "Votre déclaration porte actuellement le statut « En vérification » et va être examinée par un administrateur.",
          "Cet accusé confirme uniquement la bonne réception des informations déclarées ; il ne constitue pas une preuve bancaire de règlement.",
          "Vous pouvez télécharger votre accusé de soumission PDF depuis votre espace contribuable et serez informé dès qu'une décision administrative sera enregistrée.",
        ],
        actionPath: relativePath,
        actionLabel: "Suivre ma déclaration dans mon espace",
      });
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de l'accusé de déclaration (${params.internalReference}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  /** Sends an automatic acknowledgment when an administrator records a decision (CONFIRME, REJETE, CORRECTION_DEMANDE. */
  async sendPaymentDecisionNotification(params: {
    userId?: string | null;
    paymentId: string;
    internalReference: string;
    obligation?: ObligationEntity | null;
    taxReference: string;
    taxTypeName: string;
    period: string;
    amount: string | number;
    currency: string;
    status: PaymentStatus;
    reason?: string | null;
    decidedAt: Date;
    recipientName: string;
    recipientEmail: string;
  }): Promise<void> {
    try {
      if (!params.userId) return;
      const user = await this.users.findOne({ where: { id: params.userId } });
      if (!user) return;

      const formattedAmount = `${new Intl.NumberFormat("fr-FR").format(Number(params.amount))} ${params.currency}`;
      const relativePath = `/client/paiements/${encodeURIComponent(params.paymentId)}`;

      const statusLabel =
        params.status === PaymentStatus.CONFIRMED
          ? "Confirmée par l'administration"
          : params.status === PaymentStatus.REJECTED
            ? "Rejetée"
            : "Correction demandée";

      const nextSteps =
        params.status === PaymentStatus.CONFIRMED
          ? [
              "Votre déclaration a été confirmée en interne par l'administration et l'obligation associée est marquée comme réglée.",
              "Votre reçu interne est désormais disponible au téléchargement dans la rubrique « Mes reçus » de votre espace contribuable.",
            ]
          : [
              `Motif indiqué par l'administration : ${params.reason ?? "Voir le détail dans votre espace"}.`,
              "Consultez le détail de votre déclaration dans votre espace contribuable afin de soumettre une nouvelle déclaration corrigée.",
            ];

      await this.dispatchClientAcknowledgment({
        user,
        obligation: params.obligation ?? null,
        recipientEmail: params.recipientEmail,
        recipientName: params.recipientName,
        idempotencyKey: `CLIENT_DECISION:${params.paymentId}:${params.status}`,
        reminderType: "DECISION_PAIEMENT",
        inAppTitle: `Décision sur votre déclaration ${params.internalReference} : ${statusLabel}`,
        inAppMessage:
          params.status === PaymentStatus.CONFIRMED
            ? `Votre déclaration ${params.internalReference} (${params.taxTypeName} · ${params.period}) a été confirmée par l'administration. Votre reçu interne est disponible.`
            : `Votre déclaration ${params.internalReference} (${params.taxTypeName} · ${params.period}) fait l'objet d'une décision « ${statusLabel} ». Motif : ${params.reason ?? "Consultez votre dossier"}.`,
        link: relativePath,
        emailSubject: `[Portail SRE · ${params.internalReference}] Décision sur votre déclaration — ${statusLabel}`,
        emailTitle: `Mise à jour de votre déclaration (${statusLabel})`,
        confirmationIntro: `Une décision administrative a été enregistrée concernant votre déclaration de paiement ${params.internalReference}.`,
        reference: params.internalReference,
        actionSummary: `Décision administrative : ${statusLabel}`,
        submittedAt: params.decidedAt,
        summaryRows: [
          { label: "Impôt / Taxe", value: params.taxTypeName },
          { label: "Période fiscale", value: params.period },
          { label: "Référence d'obligation", value: params.taxReference },
          { label: "Montant déclaré", value: formattedAmount },
          { label: "Nouveau statut", value: statusLabel },
          ...(params.reason
            ? [{ label: "Motif administratif", value: params.reason }]
            : []),
        ],
        nextSteps,
        actionPath: relativePath,
        actionLabel: "Consulter le détail de ma déclaration",
      });
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de la notification de décision (${params.internalReference}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  /** Sends an automatic acknowledgment when a visitor registers a new client/taxpayer account. */
  async sendRegistrationAcknowledgment(params: {
    user: UserEntity;
    taxpayerId: string;
    recipientName: string;
    recipientEmail: string;
    taxpayerType: string;
    nif?: string | null;
    stat?: string | null;
    city: string;
    registeredAt?: Date;
  }): Promise<void> {
    try {
      const isBusiness = params.taxpayerType === "ENTREPRISE";
      const reference =
        params.nif ||
        params.stat ||
        `CPT-${params.taxpayerId.slice(0, 8).toUpperCase()}`;

      await this.dispatchClientAcknowledgment({
        user: params.user,
        recipientEmail: params.recipientEmail,
        recipientName: params.recipientName,
        idempotencyKey: `CLIENT_ACK_REGISTER:${params.user.id}`,
        reminderType: "ACCUSE_INSCRIPTION",
        inAppTitle: "Bienvenue sur le portail SRE — Compte créé",
        inAppMessage: `Votre profil contribuable (${isBusiness ? "Entreprise" : "Particulier"}, réf. ${reference}) est actif. Vous pouvez consulter vos obligations et déclarer vos paiements.`,
        link: "/client",
        emailSubject: `[Portail SRE · ${reference}] Confirmation de création de votre compte contribuable`,
        emailTitle: "Confirmation d'enregistrement de votre compte",
        confirmationIntro:
          "Votre compte utilisateur et votre dossier contribuable ont bien été enregistrés sur le portail du Service Régional des Entreprises.",
        reference,
        actionSummary: `Création d'un profil contribuable (${isBusiness ? "Entreprise" : "Particulier"})`,
        submittedAt: params.registeredAt ?? new Date(),
        summaryRows: [
          {
            label: "Type de profil",
            value: isBusiness ? "Entreprise" : "Particulier",
          },
          { label: "Nom / Raison sociale", value: params.recipientName },
          ...(params.nif ? [{ label: "NIF", value: params.nif }] : []),
          ...(params.stat ? [{ label: "STAT", value: params.stat }] : []),
          { label: "Ville / Commune", value: params.city },
        ],
        nextSteps: [
          "Votre espace contribuable est immédiatement accessible avec votre adresse e-mail et votre mot de passe.",
          "Consultez la rubrique « Mes impôts » pour suivre vos obligations fiscales enregistrées.",
          "Utilisez « Déclarer un paiement » pour transmettre vos références de règlement à l'administration.",
        ],
        actionPath: "/client",
        actionLabel: "Accéder à mon espace contribuable",
      });
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de l'accusé d'inscription (${params.user.id}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  /** Sends an automatic acknowledgment when a client updates their fiscal profile or completes their initial account. */
  async sendProfileUpdateAcknowledgment(params: {
    userId: string;
    taxpayerId: string;
    recipientName: string;
    recipientEmail: string;
    nif?: string | null;
    actionLabel: string;
    summaryRows: EmailSummaryRow[];
    idempotencyToken: string;
    updatedAt?: Date;
  }): Promise<void> {
    try {
      const user = await this.users.findOne({ where: { id: params.userId } });
      if (!user) return;

      const reference =
        params.nif || `DOS-${params.taxpayerId.slice(0, 8).toUpperCase()}`;

      await this.dispatchClientAcknowledgment({
        user,
        recipientEmail: params.recipientEmail,
        recipientName: params.recipientName,
        idempotencyKey: `CLIENT_ACK_PROFILE:${params.taxpayerId}:${params.idempotencyToken}`,
        reminderType: "ACCUSE_PROFIL",
        inAppTitle: `Confirmation : ${params.actionLabel}`,
        inAppMessage: `Vos informations (${params.actionLabel.toLowerCase()}) ont bien été enregistrées sur le serveur.`,
        link: "/client/profil",
        emailSubject: `[Portail SRE · ${reference}] Accusé de réception — ${params.actionLabel}`,
        emailTitle: `Confirmation : ${params.actionLabel}`,
        confirmationIntro:
          "Nous vous confirmons que la mise à jour de votre dossier contribuable a bien été prise en compte et enregistrée.",
        reference,
        actionSummary: params.actionLabel,
        submittedAt: params.updatedAt ?? new Date(),
        summaryRows: params.summaryRows,
        nextSteps: [
          "Vos nouvelles coordonnées sont immédiatement actives sur votre dossier fiscal.",
          "Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement l'administration SRE.",
        ],
        actionPath: "/client/profil",
        actionLabel: "Consulter mon profil fiscal",
      });
    } catch (error) {
      this.logger.warn(
        `Erreur non bloquante lors de l'accusé de mise à jour profil (${params.taxpayerId}) : ${sanitizeErrorMessage(error)}`,
      );
    }
  }

  private async dispatchClientAcknowledgment(options: {
    user: UserEntity;
    obligation?: ObligationEntity | null;
    recipientEmail: string;
    recipientName: string;
    idempotencyKey: string;
    reminderType: string;
    inAppTitle: string;
    inAppMessage: string;
    link: string;
    emailSubject: string;
    emailTitle: string;
    confirmationIntro: string;
    reference: string;
    actionSummary: string;
    submittedAt: Date;
    summaryRows: EmailSummaryRow[];
    nextSteps: string[];
    actionPath: string;
    actionLabel: string;
  }): Promise<void> {
    const transportConfigured = this.isTransportConfigured;
    let notification = await this.notifications.findOne({
      where: { idempotencyKey: options.idempotencyKey },
    });

    if (notification) {
      if (notification.emailStatus === NotificationEmailStatus.SENT) {
        this.logger.log(
          `Accusé client déjà envoyé (idempotence=${options.idempotencyKey}) — doublon évité.`,
        );
        return;
      }
    } else {
      notification = this.notifications.create({
        user: options.user,
        obligation: options.obligation ?? null,
        createdBy: null,
        reminderType: options.reminderType.slice(0, 48),
        title: options.inAppTitle.slice(0, 160),
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
          return;
        }
        throw error;
      }
    }

    if (!transportConfigured) {
      notification.emailStatus = NotificationEmailStatus.NON_CONFIGURE;
      await this.notifications.save(notification);
      return;
    }

    if (!isValidEmail(options.recipientEmail)) {
      notification.emailAttempts += 1;
      notification.emailStatus = NotificationEmailStatus.FAILED;
      notification.lastEmailError = "Adresse e-mail du client absente ou invalide.";
      await this.notifications.save(notification);
      return;
    }

    const { text, html } = buildAcknowledgmentEmail({
      recipientName: options.recipientName,
      title: options.emailTitle,
      confirmationIntro: options.confirmationIntro,
      reference: options.reference,
      actionSummary: options.actionSummary,
      submittedAt: options.submittedAt,
      timeZone: this.timeZone,
      summaryRows: options.summaryRows,
      nextSteps: options.nextSteps,
      appUrl: this.appBaseUrl,
      actionPath: options.actionPath,
      actionLabel: options.actionLabel,
    });

    notification.emailAttempts += 1;
    try {
      await this.mail.send({
        recipient: options.recipientEmail,
        recipientName: options.recipientName,
        subject: options.emailSubject,
        text,
        html,
      });
      notification.emailStatus = NotificationEmailStatus.SENT;
      notification.emailSentAt = new Date();
      notification.lastEmailError = null;
      await this.notifications.save(notification);
      this.logger.log(
        `Accusé de réception client envoyé (cle=${options.idempotencyKey}, ref=${options.reference}).`,
      );
    } catch (error) {
      const sanitized = sanitizeErrorMessage(error);
      notification.emailStatus = NotificationEmailStatus.FAILED;
      notification.lastEmailError = sanitized;
      await this.notifications.save(notification);
      this.logger.error(
        `Échec d'envoi de l'accusé client (cle=${options.idempotencyKey}, ref=${options.reference}) : ${sanitized}`,
      );
    }
  }
}
