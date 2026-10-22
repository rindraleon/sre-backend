import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export interface OutgoingEmail {
  recipient: string;
  recipientName?: string;
  /** Address the recipient can reply to (validated before sending). */
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

/** Injection token of the mail service (replaceable with a fake in tests). */
export const MAIL_SERVICE = "MAIL_SERVICE";

export interface MailSender {
  send(email: OutgoingEmail): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(address: string | null | undefined): boolean {
  return Boolean(address && EMAIL_PATTERN.test(address.trim()));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Simple HTML template, readable on mobile, with no attachment or secret data. */
export function buildEmailHtml(settings: {
  recipientName?: string;
  title: string;
  message: string;
  appLink: string;
  /** Label of the action link (default: « Consulter mon espace SRE »). */
  linkLabel?: string;
}): string {
  const bonjour = settings.recipientName
    ? `Bonjour ${escapeHtml(settings.recipientName)},`
    : "Bonjour,";
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#18283c;line-height:1.55">
<p>${bonjour}</p>
<h1 style="font-size:18px">${escapeHtml(settings.title)}</h1>
<p>${escapeHtml(settings.message)}</p>
<p><a href="${escapeHtml(settings.appLink)}">${escapeHtml(settings.linkLabel ?? "Consulter mon espace SRE")}</a></p>
<p style="font-size:12px;color:#5b6b7a">Message automatique du portail SRE. Ne répondez pas à cet e-mail et ne transmettez jamais votre mot de passe.</p>
</body></html>`;
}

/**
 * Sends e-mails according to `MAIL_TRANSPORT`:
 * - `smtp`: real SMTP via nodemailer (SMTP_HOST/PORT/USER/PASSWORD/FROM variables);
 * - `capture`: in-memory capture box (tests/development, no real send);
 * - other/absent: not configured -> explicit error, never a fake successful send.
 * No secret is ever logged.
 */
@Injectable()
export class MailService implements MailSender {
  private readonly activityLog = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  /** Capture box (`capture` transport) — inspectable by tests. */
  readonly capturedEmails: OutgoingEmail[] = [];

  constructor(private readonly configuration: ConfigService) {
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .toLowerCase();
    if (mode === "smtp") {
      this.transporter = createTransport({
        host: this.configuration.getOrThrow<string>("SMTP_HOST"),
        port: Number(this.configuration.get<string>("SMTP_PORT", "587")),
        secure: this.configuration.get<string>("SMTP_SECURE") === "true",
        auth: {
          user: this.configuration.getOrThrow<string>("SMTP_USER"),
          pass: this.configuration.getOrThrow<string>("SMTP_PASSWORD"),
        },
      });
    }
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (!isValidEmail(email.recipient))
      throw new Error("Adresse e-mail du destinataire absente ou invalide.");
    if (email.replyTo && !isValidEmail(email.replyTo))
      throw new Error("Adresse e-mail Reply-To absente ou invalide.");
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .toLowerCase();
    if (mode === "capture") {
      this.capturedEmails.push(email);
      this.activityLog.log(
        `Courriel capturé (aucun envoi réel) : ${email.subject}`,
      );
      return;
    }
    if (mode === "smtp" && this.transporter) {
      const sender =
        this.configuration.get<string>("MAIL_FROM") ??
        this.configuration.getOrThrow<string>("SMTP_USER");
      await this.transporter.sendMail({
        from: sender,
        to: email.recipient,
        ...(email.replyTo ? { replyTo: email.replyTo } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return;
    }
    throw new Error("Transport e-mail non configuré (MAIL_TRANSPORT absent).");
  }
}
