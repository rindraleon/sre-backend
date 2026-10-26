import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  ContactEmailStatus,
  ContactMessageEntity,
  ContactMessageSource,
  ContactMessageStatus,
  type ContactReplyHistoryItem,
} from "../database/entities/contact-message.entity";
import { AccountRole } from "../database/enums";
import { AcknowledgmentService } from "./acknowledgment.service";
import { AdminNotificationService } from "./admin-notification.service";
import { DEFAULT_TIMEZONE } from "./deadline-reminders.service";
import {
  type ContactEmailRetryType,
  ReplyContactMessageDto,
} from "./dto/contact-messages-admin.dto";
import { ClientContactDto, PublicContactDto } from "./dto/public-contact.dto";
import {
  buildContactReplyEmail,
  sanitizeErrorMessage,
} from "./email-templates";
import { isValidEmail, MAIL_SERVICE, type MailSender } from "./mail.service";

export interface PublicContactResult {
  statut: "ENVOYE" | "CAPTURE";
  message: string;
  reference: string;
  dateSoumission: string;
  accuseReception: {
    statut: ContactEmailStatus;
    destinataire: string;
  };
  dejaEnregistre?: boolean;
}

export interface ContactMessageView {
  id: string;
  reference: string;
  nom: string;
  courriel: string;
  sujet: string;
  message: string;
  source: ContactMessageSource;
  utilisateurId: string | null;
  statut: ContactMessageStatus;
  lue: boolean;
  luLe: Date | null;
  statutCourriel: ContactEmailStatus;
  tentativesCourriel: number;
  derniereErreurCourriel: string | null;
  courrielEnvoyeLe: Date | null;
  statutAccuse: ContactEmailStatus;
  tentativesAccuse: number;
  derniereErreurAccuse: string | null;
  accuseEnvoyeLe: Date | null;
  sujetReponse: string | null;
  messageReponse: string | null;
  reponduLe: Date | null;
  reponduParId: string | null;
  reponduParNom: string | null;
  statutCourrielReponse: ContactEmailStatus | null;
  tentativesCourrielReponse: number;
  derniereErreurCourrielReponse: string | null;
  historiqueReponses: ContactReplyHistoryItem[];
  creeLe: Date;
  modifieLe: Date;
}

export interface ContactReplyResult {
  resultat: "ENVOYE" | "CAPTURE" | "ECHEC" | "NON_CONFIGURE";
  confirmation: string;
  erreurCourriel: string | null;
  dejaEnvoye?: boolean;
  message: ContactMessageView;
}

const DEDUPLICATION_WINDOW_MS = 5 * 60 * 1000;

function computeContentHash(
  email: string,
  subject: string,
  message: string,
): string {
  return createHash("sha256")
    .update(
      `${email.trim().toLowerCase()}|${subject.trim().toLowerCase()}|${message.trim().toLowerCase()}`,
    )
    .digest("hex");
}

function generateContactReference(date = new Date()): string {
  const year = date.getFullYear();
  const suffix = randomBytes(4).toString("hex").toUpperCase();
  return `MSG-${year}-${suffix}`;
}

@Injectable()
export class PublicContactService {
  private readonly logger = new Logger(PublicContactService.name);

  constructor(
    @InjectRepository(ContactMessageEntity)
    private readonly messages: Repository<ContactMessageEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly emails: MailSender,
    private readonly adminNotifications: AdminNotificationService,
    private readonly acknowledgments: AcknowledgmentService,
  ) {}

  private get mailMode(): string {
    return this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .trim()
      .toLowerCase();
  }

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

  /** Records a contact message from a public visitor (or client), sends an automatic notification to active administr. */
  async send(
    data: PublicContactDto,
    authenticatedUser?: AuthenticatedUser | null,
  ): Promise<PublicContactResult> {
    const mode = this.mailMode;

    // Honeypot filled: a bot. Nothing is stored, nothing is sent.
    if (data.siteWeb?.trim()) {
      const fakeRef = generateContactReference();
      return {
        statut: mode === "capture" ? "CAPTURE" : "ENVOYE",
        message:
          mode === "capture"
            ? "Le formulaire a été traité en mode test ; aucun courriel réel n’a été envoyé."
            : "Votre message a été transmis à l’administration.",
        reference: fakeRef,
        dateSoumission: new Date().toISOString(),
        accuseReception: {
          statut:
            mode === "capture" || mode === "smtp"
              ? ContactEmailStatus.SENT
              : ContactEmailStatus.NON_CONFIGURE,
          destinataire: data.courriel?.trim().toLowerCase() ?? "",
        },
      };
    }

    const name = (data.nom ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const email = (data.courriel ?? "").trim().toLowerCase();
    const subject = (data.sujet ?? "")
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 140);
    const message = (data.message ?? "").trim().slice(0, 4000);

    if (name.length < 2) {
      throw new BadRequestException(
        "Le nom doit contenir entre 2 et 120 caractères.",
      );
    }
    if (!isValidEmail(email)) {
      throw new BadRequestException("Adresse e-mail invalide.");
    }
    if (subject.length < 3) {
      throw new BadRequestException(
        "Le sujet doit contenir entre 3 et 140 caractères.",
      );
    }
    if (message.length < 10) {
      throw new BadRequestException(
        "Le message doit contenir au moins 10 caractères.",
      );
    }

    const contentHash = computeContentHash(email, subject, message);
    const windowStart = new Date(Date.now() - DEDUPLICATION_WINDOW_MS);

    // Deduplication.
    const existing = await this.messages.findOne({
      where: {
        contentHash,
        createdAt: MoreThan(windowStart),
      },
      order: { createdAt: "DESC" },
    });

    if (existing) {
      this.logger.log(
        `Soumission de contact répétée détectée (ref=${existing.reference ?? existing.id}) — doublon évité.`,
      );
      if (existing.emailStatus === ContactEmailStatus.FAILED) {
        const retryAdmin =
          await this.adminNotifications.notifyContactMessage(existing);
        existing.emailStatus = retryAdmin.status;
        existing.emailAttempts += retryAdmin.attempts;
        existing.lastEmailError = retryAdmin.lastError;
        if (retryAdmin.status === ContactEmailStatus.SENT) {
          existing.emailSentAt = new Date();
        }
        await this.messages.save(existing);
      }
      if (existing.ackEmailStatus === ContactEmailStatus.FAILED) {
        await this.acknowledgments.sendContactAcknowledgment(existing, true);
      }
      return this.buildSubmissionResponse(existing, mode, true);
    }

    const initialEmailStatus =
      mode === "capture" || mode === "smtp"
        ? ContactEmailStatus.PENDING
        : ContactEmailStatus.NON_CONFIGURE;

    const source = authenticatedUser
      ? ContactMessageSource.CLIENT_PORTAL
      : (data.source ?? ContactMessageSource.PUBLIC_SITE);

    const reference = generateContactReference();

    // 1. Persist the message first (system of record).
    const stored = await this.messages.save(
      this.messages.create({
        reference,
        name,
        email,
        subject,
        message,
        source,
        senderUserId: authenticatedUser?.id ?? null,
        status: ContactMessageStatus.UNREAD,
        isRead: false,
        readAt: null,
        emailStatus: initialEmailStatus,
        emailAttempts: 0,
        lastEmailError: null,
        emailSentAt: null,
        ackEmailStatus: initialEmailStatus,
        ackEmailAttempts: 0,
        lastAckEmailError: null,
        ackEmailSentAt: null,
        replySubject: null,
        replyMessage: null,
        repliedAt: null,
        repliedById: null,
        repliedByName: null,
        replyEmailStatus: null,
        replyEmailAttempts: 0,
        lastReplyEmailError: null,
        replyHistory: [],
        contentHash,
      }),
    );

    this.logger.log(
      `Nouveau message de contact enregistré (id=${stored.id}, ref=${reference}, source=${source}).`,
    );

    // 2. Notify active administrators (in-app + e-mail).
    const adminResult =
      await this.adminNotifications.notifyContactMessage(stored);
    stored.emailStatus = adminResult.status;
    stored.emailAttempts = adminResult.attempts;
    stored.lastEmailError = adminResult.lastError;
    stored.emailSentAt =
      adminResult.status === ContactEmailStatus.SENT ? new Date() : null;
    await this.messages.save(stored);

    // 3. Send automatic acknowledgment e-mail to the visitor or client.
    await this.acknowledgments.sendContactAcknowledgment(stored);

    return this.buildSubmissionResponse(stored, mode, false);
  }

  /** Sends a contact message from a signed-in client workspace, pre-filling the user's name and e-mail from their aut. */
  async sendFromClient(
    user: AuthenticatedUser,
    data: ClientContactDto,
  ): Promise<PublicContactResult> {
    return this.send(
      {
        nom: data.nom?.trim() || user.name,
        courriel: data.courriel?.trim() || user.email,
        sujet: data.sujet,
        message: data.message,
        source: ContactMessageSource.CLIENT_PORTAL,
      },
      user,
    );
  }

  private buildSubmissionResponse(
    stored: ContactMessageEntity,
    mode: string,
    alreadyRecorded: boolean,
  ): PublicContactResult {
    const reference =
      stored.reference ?? `MSG-${stored.id.slice(0, 8).toUpperCase()}`;
    return {
      statut: mode === "capture" ? "CAPTURE" : "ENVOYE",
      message:
        mode === "capture"
          ? `Le formulaire a été traité en mode test (réf. ${reference}) ; aucun courriel réel n’a été envoyé.`
          : `Votre message a bien été enregistré sous la référence ${reference} et transmis à l’administration.`,
      reference,
      dateSoumission: (stored.createdAt ?? new Date()).toISOString(),
      accuseReception: {
        statut: stored.ackEmailStatus,
        destinataire: stored.email,
      },
      ...(alreadyRecorded ? { dejaEnregistre: true } : {}),
    };
  }

  /** Lightweight counters for the administrator topbar SMS badge and inbox tabs. */
  async getUnreadCounts() {
    const [total, nonLus, lus, enAttenteReponse, repondus] = await Promise.all([
      this.messages.count(),
      this.messages.count({ where: { status: ContactMessageStatus.UNREAD } }),
      this.messages.count({ where: { status: ContactMessageStatus.READ } }),
      this.messages.count({
        where: { status: ContactMessageStatus.PENDING_REPLY },
      }),
      this.messages.count({
        where: { status: ContactMessageStatus.REPLIED },
      }),
    ]);
    return {
      total,
      unread: nonLus,
      pendingReply: enAttenteReponse,
      counts: {
        nonLus,
        lus,
        enAttenteReponse,
        repondus,
      },
    };
  }

  /** Lists contact messages for administrators with search, filtering, and sorting. */
  async listForAdministration(options: {
    unreadOnly?: boolean;
    status?: string;
    emailStatus?: string;
    source?: string;
    search?: string;
    sort?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(Number(options.limit) || 100, 1), 300);
    const builder = this.messages.createQueryBuilder("message").take(take);

    if (options.unreadOnly) {
      builder.andWhere("message.isRead = false");
    }
    const statusFilter = options.status?.trim().toUpperCase();
    if (
      statusFilter &&
      statusFilter !== "TOUS" &&
      Object.values(ContactMessageStatus).includes(
        statusFilter as ContactMessageStatus,
      )
    ) {
      builder.andWhere("message.status = :statusFilter", { statusFilter });
    }

    const emailStatusFilter = options.emailStatus?.trim().toUpperCase();
    if (
      emailStatusFilter &&
      emailStatusFilter !== "TOUS" &&
      Object.values(ContactEmailStatus).includes(
        emailStatusFilter as ContactEmailStatus,
      )
    ) {
      builder.andWhere("message.emailStatus = :emailStatusFilter", {
        emailStatusFilter,
      });
    }

    const sourceFilter = options.source?.trim().toUpperCase();
    if (
      sourceFilter &&
      sourceFilter !== "TOUS" &&
      Object.values(ContactMessageSource).includes(
        sourceFilter as ContactMessageSource,
      )
    ) {
      builder.andWhere("message.source = :sourceFilter", { sourceFilter });
    }

    const term = options.search?.trim();
    if (term) {
      const pattern = `%${term.toLowerCase()}%`;
      builder.andWhere(
        `(LOWER(message.name) LIKE :pattern
          OR LOWER(message.email) LIKE :pattern
          OR LOWER(message.subject) LIKE :pattern
          OR LOWER(message.message) LIKE :pattern
          OR LOWER(COALESCE(message.reference, '')) LIKE :pattern
          OR LOWER(COALESCE(message.replyMessage, '')) LIKE :pattern)`,
        { pattern },
      );
    }

    switch (options.sort) {
      case "date_asc":
        builder.orderBy("message.createdAt", "ASC");
        break;
      case "date_desc":
        builder.orderBy("message.createdAt", "DESC");
        break;
      case "expediteur":
        builder
          .orderBy("LOWER(message.name)", "ASC")
          .addOrderBy("message.createdAt", "DESC");
        break;
      case "statut":
        builder
          .orderBy("message.status", "ASC")
          .addOrderBy("message.createdAt", "DESC");
        break;
      case "non_lus":
      default:
        builder
          .orderBy("message.isRead", "ASC")
          .addOrderBy("message.createdAt", "DESC");
        break;
    }

    const [rows, counters] = await Promise.all([
      builder.getMany(),
      this.getUnreadCounts(),
    ]);

    return {
      total: counters.total,
      unread: counters.unread,
      pendingReply: counters.pendingReply,
      counts: counters.counts,
      messages: rows.map((row) => this.toContactMessageView(row)),
    };
  }

  /** Opens a contact message in the administrator view and automatically marks it as read (`LU`) if it was previously. */
  async getOneForAdministration(
    id: string,
    markRead = true,
  ): Promise<ContactMessageView> {
    const message = await this.messages.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException("Message de contact introuvable.");
    }
    if (
      markRead &&
      (!message.isRead || message.status === ContactMessageStatus.UNREAD)
    ) {
      message.isRead = true;
      message.readAt = message.readAt ?? new Date();
      if (message.status === ContactMessageStatus.UNREAD) {
        message.status = ContactMessageStatus.READ;
      }
      await this.messages.save(message);
      this.logger.log(
        `Message de contact ${message.reference ?? message.id} ouvert et marqué comme lu.`,
      );
    }
    return this.toContactMessageView(message);
  }

  /** Marks a contact message as read. */
  async markAsRead(id: string) {
    const message = await this.messages.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException("Message de contact introuvable.");
    }
    if (!message.isRead || message.status === ContactMessageStatus.UNREAD) {
      message.isRead = true;
      message.readAt = message.readAt ?? new Date();
      if (message.status === ContactMessageStatus.UNREAD) {
        message.status = ContactMessageStatus.READ;
      }
      await this.messages.save(message);
    }
    return {
      id: message.id,
      lue: true,
      statut: message.status,
      message: this.toContactMessageView(message),
    };
  }

  /** Updates the status of a contact message (NON_LU, LU, EN_ATTENTE_REPONSE, REPONDU). */
  async updateStatus(
    id: string,
    status: ContactMessageStatus,
  ): Promise<ContactMessageView> {
    const message = await this.messages.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException("Message de contact introuvable.");
    }
    message.status = status;
    message.isRead = status !== ContactMessageStatus.UNREAD;
    if (status === ContactMessageStatus.UNREAD) {
      message.readAt = null;
    } else if (!message.readAt) {
      message.readAt = new Date();
    }
    const saved = await this.messages.save(message);
    this.logger.log(
      `Statut du message ${saved.reference ?? saved.id} mis à jour : ${status}.`,
    );
    return this.toContactMessageView(saved);
  }

  /** Sends a direct reply by e-mail from an administrator to the contact message sender, records the reply in the dat. */
  async replyToMessage(
    id: string,
    admin: AuthenticatedUser,
    dto: ReplyContactMessageDto,
  ): Promise<ContactReplyResult> {
    if (admin.role !== AccountRole.ADMIN) {
      throw new ForbiddenException(
        "Seul un administrateur est autorisé à répondre aux messages de contact.",
      );
    }

    const message = await this.messages.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException("Message de contact introuvable.");
    }

    const replyBody = (dto.message ?? "").trim().slice(0, 4000);
    if (replyBody.length < 5) {
      throw new BadRequestException(
        "Le contenu de la réponse doit comporter au moins 5 caractères.",
      );
    }

    const defaultSubject = message.subject.toLowerCase().startsWith("re:")
      ? message.subject
      : `Re: ${message.subject}`;
    const replySubject = (dto.sujet?.trim() || defaultSubject).slice(0, 200);
    const reference =
      message.reference ?? `MSG-${message.id.slice(0, 8).toUpperCase()}`;

    // Deduplication check.
    if (
      message.replyMessage?.trim() === replyBody &&
      message.replyEmailStatus === ContactEmailStatus.SENT &&
      message.repliedAt &&
      Date.now() - message.repliedAt.getTime() < 2 * 60 * 1000
    ) {
      this.logger.log(
        `Réponse identique déjà envoyée récemment pour ${reference} — doublon évité.`,
      );
      return {
        resultat: this.mailMode === "capture" ? "CAPTURE" : "ENVOYE",
        confirmation: `Cette réponse a déjà été envoyée à ${message.email}.`,
        erreurCourriel: null,
        dejaEnvoye: true,
        message: this.toContactMessageView(message),
      };
    }

    const now = new Date();
    const mode = this.mailMode;
    const transportConfigured = mode === "smtp" || mode === "capture";

    // Persist the reply in the database first so no data is ever lost if SMTP fails.
    message.replySubject = replySubject;
    message.replyMessage = replyBody;
    message.repliedAt = now;
    message.repliedById = admin.id;
    message.repliedByName = admin.name;
    message.isRead = true;
    message.readAt = message.readAt ?? now;
    message.replyEmailAttempts = (message.replyEmailAttempts ?? 0) + 1;

    if (!transportConfigured) {
      message.replyEmailStatus = ContactEmailStatus.NON_CONFIGURE;
      message.lastReplyEmailError = null;
      message.status = ContactMessageStatus.REPLIED;
      message.replyHistory = [
        ...(Array.isArray(message.replyHistory) ? message.replyHistory : []),
        {
          id: randomBytes(8).toString("hex"),
          sujet: replySubject,
          message: replyBody,
          reponduLe: now.toISOString(),
          reponduParId: admin.id,
          reponduParNom: admin.name,
          statutCourriel: ContactEmailStatus.NON_CONFIGURE,
          erreurCourriel: null,
        },
      ];
      const saved = await this.messages.save(message);
      this.logger.log(
        `Réponse enregistrée pour ${reference} par ${admin.name} (transport e-mail non configuré).`,
      );
      return {
        resultat: "NON_CONFIGURE",
        confirmation:
          "Votre réponse a été enregistrée dans le portail. Aucun transport SMTP n'étant configuré, aucun courriel externe n'a été expédié.",
        erreurCourriel: null,
        message: this.toContactMessageView(saved),
      };
    }

    const { text, html } = buildContactReplyEmail({
      recipientName: message.name,
      reference,
      originalSubject: message.subject,
      originalMessage: message.message,
      originalDate: message.createdAt ?? now,
      replySubject,
      replyMessage: replyBody,
      administratorName: admin.name,
      appUrl: this.appBaseUrl,
      timeZone: this.timeZone,
    });

    try {
      await this.emails.send({
        recipient: message.email,
        recipientName: message.name,
        subject: `[Portail SRE · ${reference}] ${replySubject}`,
        text,
        html,
      });

      message.replyEmailStatus = ContactEmailStatus.SENT;
      message.lastReplyEmailError = null;
      message.status = ContactMessageStatus.REPLIED;
      message.replyHistory = [
        ...(Array.isArray(message.replyHistory) ? message.replyHistory : []),
        {
          id: randomBytes(8).toString("hex"),
          sujet: replySubject,
          message: replyBody,
          reponduLe: now.toISOString(),
          reponduParId: admin.id,
          reponduParNom: admin.name,
          statutCourriel: ContactEmailStatus.SENT,
          erreurCourriel: null,
        },
      ];
      const saved = await this.messages.save(message);
      this.logger.log(
        `Réponse envoyée avec succès pour le message ${reference} à ${message.email} (tentative=${saved.replyEmailAttempts}).`,
      );

      return {
        resultat: mode === "capture" ? "CAPTURE" : "ENVOYE",
        confirmation:
          mode === "capture"
            ? `Réponse enregistrée et capturée en mode test à destination de ${message.email}.`
            : `Votre réponse a bien été envoyée par e-mail à ${message.email}.`,
        erreurCourriel: null,
        message: this.toContactMessageView(saved),
      };
    } catch (error) {
      const sanitized = sanitizeErrorMessage(error);
      message.replyEmailStatus = ContactEmailStatus.FAILED;
      message.lastReplyEmailError = sanitized;
      if (message.status !== ContactMessageStatus.REPLIED) {
        message.status = ContactMessageStatus.PENDING_REPLY;
      }
      message.replyHistory = [
        ...(Array.isArray(message.replyHistory) ? message.replyHistory : []),
        {
          id: randomBytes(8).toString("hex"),
          sujet: replySubject,
          message: replyBody,
          reponduLe: now.toISOString(),
          reponduParId: admin.id,
          reponduParNom: admin.name,
          statutCourriel: ContactEmailStatus.FAILED,
          erreurCourriel: sanitized,
        },
      ];
      const saved = await this.messages.save(message);
      this.logger.error(
        `Échec d'envoi de la réponse pour le message ${reference} (tentative=${saved.replyEmailAttempts}) : ${sanitized}`,
      );

      return {
        resultat: "ECHEC",
        confirmation:
          "Votre réponse a été conservée dans le portail, mais l'envoi de l'e-mail a échoué. Vous pouvez relancer l'envoi.",
        erreurCourriel: sanitized,
        message: this.toContactMessageView(saved),
      };
    }
  }

  /** Retries failed e-mails associated with a contact message (admin notification, visitor acknowledgment, or admin r. */
  async retryMessageEmails(
    id: string,
    admin: AuthenticatedUser,
    type: ContactEmailRetryType = "TOUS",
  ): Promise<{
    message: ContactMessageView;
    relances: {
      notificationAdmin?: ContactEmailStatus;
      accuseVisiteur?: ContactEmailStatus;
      reponseAdmin?: ContactEmailStatus | null;
    };
  }> {
    if (admin.role !== AccountRole.ADMIN) {
      throw new ForbiddenException("Action réservée à l'administration.");
    }
    const message = await this.messages.findOne({ where: { id } });
    if (!message) {
      throw new NotFoundException("Message de contact introuvable.");
    }

    const relances: {
      notificationAdmin?: ContactEmailStatus;
      accuseVisiteur?: ContactEmailStatus;
      reponseAdmin?: ContactEmailStatus | null;
    } = {};

    if (type === "NOTIFICATION_ADMIN" || type === "TOUS") {
      if (message.emailStatus !== ContactEmailStatus.SENT) {
        const res = await this.adminNotifications.notifyContactMessage(message);
        message.emailStatus = res.status;
        message.emailAttempts += Math.max(1, res.attempts);
        message.lastEmailError = res.lastError;
        if (res.status === ContactEmailStatus.SENT) {
          message.emailSentAt = new Date();
        }
        await this.messages.save(message);
        relances.notificationAdmin = message.emailStatus;
      }
    }

    if (type === "ACCUSE_VISITEUR" || type === "TOUS") {
      if (message.ackEmailStatus !== ContactEmailStatus.SENT) {
        const ackRes = await this.acknowledgments.sendContactAcknowledgment(
          message,
          true,
        );
        relances.accuseVisiteur = ackRes.status;
      }
    }

    if (
      (type === "REPONSE" || type === "TOUS") &&
      message.replyMessage &&
      message.replyEmailStatus === ContactEmailStatus.FAILED
    ) {
      const replyRes = await this.replyToMessage(id, admin, {
        sujet: message.replySubject ?? undefined,
        message: message.replyMessage,
      });
      relances.reponseAdmin = replyRes.message.statutCourrielReponse;
      return {
        message: replyRes.message,
        relances,
      };
    }

    const reloaded = await this.messages.findOneByOrFail({ id });
    return {
      message: this.toContactMessageView(reloaded),
      relances,
    };
  }

  toContactMessageView(row: ContactMessageEntity): ContactMessageView {
    const reference =
      row.reference ?? `MSG-${row.id.slice(0, 8).toUpperCase()}`;
    const statut =
      row.status ??
      (row.isRead ? ContactMessageStatus.READ : ContactMessageStatus.UNREAD);
    return {
      id: row.id,
      reference,
      nom: row.name,
      courriel: row.email,
      sujet: row.subject,
      message: row.message,
      source: row.source ?? ContactMessageSource.PUBLIC_SITE,
      utilisateurId: row.senderUserId ?? null,
      statut,
      lue: row.isRead || statut !== ContactMessageStatus.UNREAD,
      luLe: row.readAt ?? null,
      statutCourriel: row.emailStatus,
      tentativesCourriel: row.emailAttempts ?? 0,
      derniereErreurCourriel: row.lastEmailError ?? null,
      courrielEnvoyeLe: row.emailSentAt ?? null,
      statutAccuse: row.ackEmailStatus ?? ContactEmailStatus.NON_CONFIGURE,
      tentativesAccuse: row.ackEmailAttempts ?? 0,
      derniereErreurAccuse: row.lastAckEmailError ?? null,
      accuseEnvoyeLe: row.ackEmailSentAt ?? null,
      sujetReponse: row.replySubject ?? null,
      messageReponse: row.replyMessage ?? null,
      repliedAt: row.repliedAt ?? null,
      reponduLe: row.repliedAt ?? null,
      reponduParId: row.repliedById ?? null,
      reponduParNom: row.repliedByName ?? null,
      statutCourrielReponse: row.replyEmailStatus ?? null,
      tentativesCourrielReponse: row.replyEmailAttempts ?? 0,
      derniereErreurCourrielReponse: row.lastReplyEmailError ?? null,
      historiqueReponses: Array.isArray(row.replyHistory)
        ? row.replyHistory
        : [],
      creeLe: row.createdAt,
      modifieLe: row.updatedAt ?? row.createdAt,
    } as ContactMessageView;
  }
}
