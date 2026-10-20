import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export interface OutgoingEmail {
  destinataire: string;
  nomDestinataire?: string;
  /** Adresse à laquelle le destinataire peut répondre (validée avant envoi). */
  replyTo?: string;
  sujet: string;
  texte: string;
  html: string;
}

/** Jeton d'injection du service de courriel (remplaçable par un faux en test). */
export const MAIL_SERVICE = "MAIL_SERVICE";

export interface MailSender {
  envoyer(courriel: OutgoingEmail): Promise<void>;
}

const MOTIF_COURRIEL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(adresse: string | null | undefined): boolean {
  return Boolean(adresse && MOTIF_COURRIEL.test(adresse.trim()));
}

function echapperHtml(valeur: string): string {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Modèle HTML simple, lisible sur mobile, sans pièce jointe ni donnée secrète. */
export function buildEmailHtml(parametres: {
  nomDestinataire?: string;
  titre: string;
  message: string;
  lienApplication: string;
  /** Libellé du lien d'action (par défaut : « Consulter mon espace SRE »). */
  libelleLien?: string;
}): string {
  const bonjour = parametres.nomDestinataire
    ? `Bonjour ${echapperHtml(parametres.nomDestinataire)},`
    : "Bonjour,";
  return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#18283c;line-height:1.55">
<p>${bonjour}</p>
<h1 style="font-size:18px">${echapperHtml(parametres.titre)}</h1>
<p>${echapperHtml(parametres.message)}</p>
<p><a href="${echapperHtml(parametres.lienApplication)}">${echapperHtml(parametres.libelleLien ?? "Consulter mon espace SRE")}</a></p>
<p style="font-size:12px;color:#5b6b7a">Message automatique du portail SRE. Ne répondez pas à cet e-mail et ne transmettez jamais votre mot de passe.</p>
</body></html>`;
}

/**
 * Envoi de courriels selon `MAIL_TRANSPORT` :
 * - `smtp` : SMTP réel via nodemailer (variables SMTP_HOST/PORT/USER/PASSWORD/FROM) ;
 * - `capture` : boîte de capture en mémoire (tests/développement, aucun envoi réel) ;
 * - autre/absent : non configuré -> erreur explicite, jamais d'envoi simulé comme réussi.
 * Aucun secret n'est journalisé.
 */
@Injectable()
export class MailService implements MailSender {
  private readonly journal = new Logger(MailService.name);
  private readonly transporteur?: Transporter;
  /** Boîte de capture (transport `capture`) — consultable par les tests. */
  readonly courrielsCaptures: OutgoingEmail[] = [];

  constructor(private readonly configuration: ConfigService) {
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .toLowerCase();
    if (mode === "smtp") {
      this.transporteur = createTransport({
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

  async envoyer(courriel: OutgoingEmail): Promise<void> {
    if (!isValidEmail(courriel.destinataire))
      throw new Error("Adresse e-mail du destinataire absente ou invalide.");
    if (courriel.replyTo && !isValidEmail(courriel.replyTo))
      throw new Error("Adresse e-mail Reply-To absente ou invalide.");
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .toLowerCase();
    if (mode === "capture") {
      this.courrielsCaptures.push(courriel);
      this.journal.log(
        `Courriel capturé (aucun envoi réel) : ${courriel.sujet}`,
      );
      return;
    }
    if (mode === "smtp" && this.transporteur) {
      const expediteur =
        this.configuration.get<string>("MAIL_FROM") ??
        this.configuration.getOrThrow<string>("SMTP_USER");
      await this.transporteur.sendMail({
        from: expediteur,
        to: courriel.destinataire,
        ...(courriel.replyTo ? { replyTo: courriel.replyTo } : {}),
        subject: courriel.sujet,
        text: courriel.texte,
        html: courriel.html,
      });
      return;
    }
    throw new Error("Transport e-mail non configuré (MAIL_TRANSPORT absent).");
  }
}
