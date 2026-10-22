import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import {
  ContactEmailStatus,
  ContactMessageEntity,
} from "../database/entities/contact-message.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import { MAIL_SERVICE, MailSender } from "./mail.service";
import { PublicContactDto } from "./dto/public-contact.dto";

export type PublicContactResult = {
  statut: "ENVOYE" | "CAPTURE";
  message: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Keeps the technical reason short and free of any secret. */
function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").slice(0, 300);
}

@Injectable()
export class PublicContactService {
  private readonly logger = new Logger(PublicContactService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ContactMessageEntity)
    private readonly messages: Repository<ContactMessageEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly emails: MailSender,
  ) {}

  async send(data: PublicContactDto): Promise<PublicContactResult> {
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .trim()
      .toLowerCase();

    // Honeypot filled: a bot. Nothing is stored, nothing is sent.
    if (data.siteWeb?.trim()) {
      return mode === "capture"
        ? {
            statut: "CAPTURE",
            message:
              "Le formulaire a été traité en mode test ; aucun courriel réel n’a été envoyé.",
          }
        : {
            statut: "ENVOYE",
            message: "Votre message a été transmis à l’administration.",
          };
    }

    const name = data.nom.trim().replace(/\s+/g, " ").slice(0, 120);
    const email = data.courriel.trim().toLowerCase();
    const subject = data.sujet
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 140);
    const message = data.message.trim().slice(0, 4000);
    if (!name || !subject || !message) {
      throw new BadRequestException(
        "Le nom, le sujet et le message doivent contenir du texte.",
      );
    }

    // The portal is the system of record: the message is written first, so it
    // survives a missing or broken mail transport.
    const stored = await this.messages.save(
      this.messages.create({
        name,
        email,
        subject,
        message,
        isRead: false,
        emailStatus:
          mode === "capture" || mode === "smtp"
            ? ContactEmailStatus.PENDING
            : ContactEmailStatus.NON_CONFIGURE,
        emailAttempts: 0,
        lastEmailError: null,
        emailSentAt: null,
      }),
    );

    let appUrl = this.configuration.get<string>("APP_URL", "").trim();
    while (appUrl.endsWith("/")) {
      appUrl = appUrl.slice(0, -1);
    }

    const text = [
      "Nouveau message envoyé depuis la section Contact du portail SRE.",
      "",
      `Nom : ${name}`,
      `Adresse e-mail : ${email}`,
      `Sujet : ${subject}`,
      "",
      "Message :",
      message,
      "",
      appUrl ? `Portail : ${appUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const htmlMessage = message
      .split(/\r?\n/)
      .map((row) => escapeHtml(row) || "&nbsp;")
      .join("<br/>");
    const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#172e25;line-height:1.6">
<p>Nouveau message envoyé depuis la section Contact du portail SRE.</p>
<table role="presentation" style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Nom</td><td>${escapeHtml(name)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Adresse e-mail</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Sujet</td><td>${escapeHtml(subject)}</td></tr>
</table>
<h2 style="font-size:16px">Message</h2><p>${htmlMessage}</p>
${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Ouvrir le portail SRE</a></p>` : ""}
<p style="font-size:12px;color:#71838a">Répondez à cet e-mail pour contacter l’expéditeur. Message transmis via le formulaire public SRE.</p>
</body></html>`;

    const administrators = await this.users.find({
      where: { role: AccountRole.ADMIN, status: AccountStatus.ACTIVE },
      select: { id: true, name: true, email: true },
    });

    if (!administrators.length) {
      await this.markEmailFailure(
        stored,
        "Aucun administrateur actif ne peut recevoir le message.",
      );
      this.logger.warn(
        "Message public enregistré sans destinataire administrateur actif.",
      );
      return {
        statut: "ENVOYE",
        message: "Votre message a été transmis à l’administration.",
      };
    }

    const results = await Promise.allSettled(
      administrators.map((administrator) =>
        this.emails.send({
          recipient: administrator.email,
          recipientName: administrator.name,
          replyTo: email,
          subject: `[Contact SRE] ${subject}`,
          text,
          html,
        }),
      ),
    );
    const sent = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    stored.emailAttempts = results.length;

    if (!sent) {
      const reasons = results
        .filter((result) => result.status === "rejected")
        .map((result) => sanitizeError((result as PromiseRejectedResult).reason));
      const reason = reasons.length ? reasons.join(" | ") : "Envoi refusé.";
      await this.markEmailFailure(stored, reason);
      this.logger.error(
        `Aucun courriel de notification envoyé pour le message public ${stored.id} : ${reason}`,
      );
      // The message is stored in the portal: the visitor is not asked to retry
      // a message that has already been recorded.
      return {
        statut: "ENVOYE",
        message: "Votre message a été transmis à l’administration.",
      };
    }

    stored.emailStatus = ContactEmailStatus.SENT;
    stored.emailSentAt = new Date();
    stored.lastEmailError = null;
    await this.messages.save(stored);

    if (mode === "capture") {
      return {
        statut: "CAPTURE",
        message:
          "Le formulaire a été traité en mode test ; aucun courriel réel n’a été envoyé.",
      };
    }
    return {
      statut: "ENVOYE",
      message: "Votre message a été transmis à l’administration.",
    };
  }

  private async markEmailFailure(
    stored: ContactMessageEntity,
    reason: string,
  ): Promise<void> {
    stored.emailStatus = ContactEmailStatus.FAILED;
    stored.lastEmailError = reason;
    await this.messages.save(stored);
  }
}
