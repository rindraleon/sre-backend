import { createHash, randomBytes } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import {
  ActivationRequestEntity,
} from "../database/entities/activation-request.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  ActivationEmailStatus,
  ActivationTokenType,
} from "../database/enums";
import { MAIL_SERVICE, MailSender, buildEmailHtml } from "./mail.service";

/** SHA-256 fingerprint of a token (the plain token is never stored). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ActivationRequestView {
  id: string;
  utilisateurId: string;
  nom: string;
  destinataire: string;
  type: ActivationTokenType;
  statutCourriel: ActivationEmailStatus;
  tentativesEnvoi: number;
  derniereTentativeLe: Date | null;
  derniereErreur: string | null;
  expireLe: Date;
  utiliseLe: Date | null;
  creeLe: Date;
}

/** Single-purpose activation / reset tokens with controlled expiry, and tracked sending of first-sign-in e-mails. */
@Injectable()
export class ActivationService {
  private readonly activityLog = new Logger(ActivationService.name);

  constructor(
    @InjectRepository(ActivationRequestEntity)
    private readonly requests: Repository<ActivationRequestEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly emails: MailSender,
  ) {}

  private validityDurationMs(): number {
    const hours = Number(
      this.configuration.get<string>("ACTIVATION_TOKEN_TTL_HOURS", "72"),
    );
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  private getAppBaseUrl(): string {
    let baseUrl = this.configuration.get<string>("APP_URL", "").trim();
    while (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    return baseUrl;
  }

  /** Creates an account's activation request (token + first-sign-in e-mail) and attempts immediate sending. */
  async createActivationRequest(
    user: UserEntity,
    label: string,
    temporaryStatNumber?: string | null,
  ): Promise<ActivationRequestView> {
    const previous = await this.requests.findOne({
      where: {
        userId: user.id,
        type: ActivationTokenType.ACTIVATION,
        usedAt: IsNull(),
      },
      order: { createdAt: "DESC" },
    });
    if (previous && previous.expiresAt.getTime() > Date.now()) {
      // Idempotency: reuse the active request instead of creating a second one.
      await this.sendActivationEmail(previous.id);
      return this.toActivationRequestView(await this.reload(previous.id));
    }

    const token = randomBytes(32).toString("hex");
    const request = this.requests.create({
      user,
      userId: user.id,
      type: ActivationTokenType.ACTIVATION,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + this.validityDurationMs()),
      usedAt: null,
      recipient: user.email,
      emailStatus: ActivationEmailStatus.PENDING,
      dispatchAttempts: 0,
    });
    const saved = await this.requests.save(request);
    await this.sendActivationEmail(saved.id, token, label, temporaryStatNumber);
    return this.toActivationRequestView(await this.reload(saved.id));
  }

  /** (Re)sends the e-mail linked to a request and updates delivery tracking. */
  async sendActivationEmail(
    requestId: string,
    knownToken?: string,
    knownLabel?: string,
    statTemporary?: string | null,
  ): Promise<ActivationRequestView> {
    const request = await this.reload(requestId);
    const user = request.user;
    const token =
      knownToken ??
      // On retry, the plain token is no longer available: a new token is issued (the previous one is invalidated) so a f.
      this.issueNewToken(request);
    const label =
      knownLabel ??
      user.taxpayer?.legalName ??
      user.taxpayer?.lastName ??
      user.name;
    const appUrl = this.getAppBaseUrl();
    const activationLink = `${appUrl}/activation?jeton=${token}`;
    const websiteLink = appUrl || "#";
    const motTemporary = statTemporary ?? null;

    request.dispatchAttempts += 1;
    request.lastAttemptAt = new Date();
    try {
      await this.emails.send({
        recipient: request.recipient,
        recipientName: label,
        subject: "Portail SRE — activation de votre espace entreprise",
        text: [
          `Bonjour ${label},`,
          "",
          "Votre espace entreprise a été créé sur le portail SRE.",
          `Adresse e-mail de connexion : ${request.recipient}`,
          motTemporary
            ? `Mot de passe provisoire : ${motTemporary} (temporaire — à changer dès la première connexion).`
            : "",
          "",
          "Première connexion (recommandée) : ouvrez le lien sécurisé ci-dessous",
          "pour définir votre mot de passe personnel et compléter votre profil :",
          activationLink,
          `Ce lien est à usage unique et expire le ${request.expiresAt.toLocaleString("fr-FR")}.`,
          "",
          "Vous pouvez aussi vous connecter depuis le site officiel :",
          websiteLink,
          "",
          "Tant que la configuration initiale n'est pas terminée, l'accès aux",
          "fonctionnalités métier reste bloqué.",
          "",
          "Message automatique du portail SRE. Ne répondez pas à cet e-mail.",
        ]
          .filter(Boolean)
          .join("\n"),
        html: this.activationEmailHtml({
          label,
          recipient: request.recipient,
          motTemporary,
          activationLink,
          websiteLink,
          expiresAt: request.expiresAt,
        }),
      });
      request.emailStatus = ActivationEmailStatus.SENT;
      request.lastError = null;
    } catch (cause) {
      request.emailStatus = ActivationEmailStatus.FAILED;
      request.lastError =
        cause instanceof Error ? cause.message.slice(0, 254) : "Envoi impossible";
      this.activityLog.warn(
        `Envoi du courriel d'activation impossible pour ${request.recipient} : ${request.lastError}`,
      );
    }
    await this.requests.save(request);
    return this.toActivationRequestView(request);
  }

  /** Creates a password reset request (single-use token) and sends the secure e-mail. */
  async createPasswordResetRequest(
    user: UserEntity,
  ): Promise<ActivationRequestView> {
    const token = randomBytes(32).toString("hex");
    const request = this.requests.create({
      user,
      userId: user.id,
      type: ActivationTokenType.PASSWORD_RESET,
      tokenHash: hashToken(token),
      expiresAt: new Date(
        Date.now() + Math.min(this.validityDurationMs(), 24 * 60 * 60 * 1000),
      ),
      usedAt: null,
      recipient: user.email,
      emailStatus: ActivationEmailStatus.PENDING,
      dispatchAttempts: 0,
    });
    await this.requests.save(request);
    const appUrl = this.getAppBaseUrl();
    const link = `${appUrl}/reinitialisation-mot-de-passe?jeton=${token}`;
    request.dispatchAttempts += 1;
    request.lastAttemptAt = new Date();
    try {
      await this.emails.send({
        recipient: request.recipient,
        recipientName: user.name,
        subject: "Portail SRE — réinitialisation de votre mot de passe",
        text: [
          `Bonjour ${user.name},`,
          "",
          "Une réinitialisation de mot de passe a été demandée pour votre compte.",
          "Ouvrez le lien sécurisé ci-dessous pour définir un nouveau mot de passe :",
          link,
          `Ce lien est à usage unique et expire le ${request.expiresAt.toLocaleString("fr-FR")}.`,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
          "",
          "Message automatique du portail SRE. Ne répondez pas à cet e-mail.",
        ].join("\n"),
        html: buildEmailHtml({
          recipientName: user.name,
          title: "Réinitialisation de votre mot de passe",
          message: `Ouvrez ce lien sécurisé pour définir un nouveau mot de passe. Il est à usage unique et expire le ${request.expiresAt.toLocaleString("fr-FR")}. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
          appLink: link,
          linkLabel: "Réinitialiser mon mot de passe",
        }),
      });
      request.emailStatus = ActivationEmailStatus.SENT;
      request.lastError = null;
    } catch (cause) {
      request.emailStatus = ActivationEmailStatus.FAILED;
      request.lastError =
        cause instanceof Error ? cause.message.slice(0, 254) : "Envoi impossible";
    }
    await this.requests.save(request);
    return this.toActivationRequestView(request);
  }

  /** Admin: list of activation e-mails with delivery status. */
  async listRequests(): Promise<ActivationRequestView[]> {
    const list = await this.requests.find({
      relations: { user: { taxpayer: true } },
      order: { createdAt: "DESC" },
    });
    return list.map((request) => this.toActivationRequestView(request));
  }

  /** Admin: retry sending a failed activation e-mail. */
  async resend(requestId: string): Promise<ActivationRequestView> {
    const request = await this.requests.findOne({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException("Courriel d'activation introuvable.");
    return this.sendActivationEmail(requestId);
  }

  /** Validates a token (type, expiry, single use) and returns the request. */
  async validateToken(
    token: string,
    type: ActivationTokenType,
    consume = false,
  ): Promise<ActivationRequestEntity> {
    const request = await this.requests.findOne({
      where: { tokenHash: hashToken(token.trim()) },
      relations: { user: true },
    });
    if (
      request?.type !== type ||
      request.usedAt !== null ||
      request.expiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException(
        "Lien invalide, déjà utilisé ou expiré. Demandez un nouveau lien.",
      );
    }
    if (consume) {
      request.usedAt = new Date();
      await this.requests.save(request);
    }
    return request;
  }

  /** Replaces an active request's fingerprint with a fresh token (retry). */
  private issueNewToken(request: ActivationRequestEntity): string {
    const token = randomBytes(32).toString("hex");
    request.tokenHash = hashToken(token);
    if (request.expiresAt.getTime() < Date.now()) {
      request.expiresAt = new Date(Date.now() + this.validityDurationMs());
    }
    return token;
  }

  private async reload(id: string): Promise<ActivationRequestEntity> {
    const request = await this.requests.findOne({
      where: { id },
      relations: { user: { taxpayer: true } },
    });
    if (!request) throw new NotFoundException("Courriel d'activation introuvable.");
    return request;
  }

  private toActivationRequestView(request: ActivationRequestEntity): ActivationRequestView {
    const user = request.user;
    return {
      id: request.id,
      utilisateurId: request.userId,
      nom:
        user?.taxpayer?.legalName ??
        user?.taxpayer?.lastName ??
        user?.name ??
        "",
      destinataire: request.recipient,
      type: request.type,
      statutCourriel: request.emailStatus,
      tentativesEnvoi: request.dispatchAttempts,
      derniereTentativeLe: request.lastAttemptAt,
      derniereErreur: request.lastError,
      expireLe: request.expiresAt,
      utiliseLe: request.usedAt,
      creeLe: request.createdAt,
    };
  }

  private activationEmailHtml(emailParams: {
    label: string;
    recipient: string;
    motTemporary: string | null;
    activationLink: string;
    websiteLink: string;
    expiresAt: Date;
  }): string {
    const e = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const credential = emailParams.motTemporary
      ? `<p><strong>Adresse e-mail :</strong> ${e(emailParams.recipient)}<br/><strong>Mot de passe provisoire :</strong> ${e(emailParams.motTemporary)} <em>(temporaire — à changer dès la première connexion)</em></p>`
      : `<p><strong>Adresse e-mail :</strong> ${e(emailParams.recipient)}</p>`;
    return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#18283c;line-height:1.55">
<p>Bonjour ${e(emailParams.label)},</p>
<h1 style="font-size:18px">Votre espace entreprise est prêt</h1>
<p>Votre compte a été créé sur le portail SRE. Voici vos informations d'accès :</p>
${credential}
<p><strong>Première connexion (recommandée)</strong> : ouvrez ce lien sécurisé pour définir votre mot de passe personnel et compléter votre profil :</p>
<p style="margin:18px 0"><a href="${e(emailParams.activationLink)}" style="background:#1d6a50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Activer mon espace</a></p>
<p style="font-size:12px;color:#5b6b7a">Ce lien est à usage unique et expire le ${e(emailParams.expiresAt.toLocaleString("fr-FR"))}.</p>
<p>Vous pouvez aussi vous connecter depuis le site officiel : <a href="${e(emailParams.websiteLink)}">${e(emailParams.websiteLink)}</a></p>
<p>Tant que la configuration initiale n'est pas terminée, l'accès aux fonctionnalités métier reste bloqué.</p>
<p style="font-size:12px;color:#5b6b7a">Message automatique du portail SRE. Ne répondez pas à cet e-mail et ne transmettez jamais votre mot de passe.</p>
</body></html>`;
  }
}
