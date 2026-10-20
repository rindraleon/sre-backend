import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import { MAIL_SERVICE, MailSender } from "./mail.service";
import { PublicContactDto } from "./dto/public-contact.dto";

export type PublicContactResult = {
  statut: "ENVOYE" | "CAPTURE";
  message: string;
};

function echapperHtml(valeur: string): string {
  return valeur
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Envoi du formulaire public vers les adresses des administrateurs actifs.
 * Le destinataire est résolu côté serveur (aucune adresse admin exposée au
 * navigateur) ; l'expéditeur est utilisé en Reply-To pour faciliter la réponse.
 * Les entrées sont validées par DTO, les robots sont filtrés par honeypot, et
 * le contrôleur applique une limite de débit par IP.
 */
@Injectable()
export class PublicContactService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly courriels: MailSender,
  ) {}

  async envoyer(donnees: PublicContactDto): Promise<PublicContactResult> {
    // Honeypot rempli : réponse de succès neutre, aucun courriel envoyé.
    // En mode capture, on conserve la même transparence que pour un envoi légitime.
    if (donnees.siteWeb?.trim()) {
      const mode = this.configuration
        .get<string>("MAIL_TRANSPORT", "")
        .toLowerCase();
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

    const administrateurs = await this.utilisateurs.find({
      where: { role: AccountRole.ADMIN, statut: AccountStatus.ACTIF },
      select: { id: true, nom: true, courriel: true },
    });
    if (!administrateurs.length) {
      throw new ServiceUnavailableException(
        "Le service de contact est temporairement indisponible. Réessayez plus tard.",
      );
    }

    const nom = donnees.nom.trim().replace(/\s+/g, " ").slice(0, 120);
    const courriel = donnees.courriel.trim().toLowerCase();
    // Supprime les contrôles de ligne afin d'empêcher l'injection d'en-tête.
    const sujet = donnees.sujet
      .trim()
      .replace(/[\r\n\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 140);
    const message = donnees.message.trim().slice(0, 4000);
    if (!nom || !sujet || !message) {
      throw new BadRequestException(
        "Le nom, le sujet et le message doivent contenir du texte.",
      );
    }
    const appUrl = this.configuration
      .get<string>("APP_URL", "")
      .trim()
      .replace(/\/+$/, "");

    const texte = [
      "Nouveau message envoyé depuis la section Contact du portail SRE.",
      "",
      `Nom : ${nom}`,
      `Adresse e-mail : ${courriel}`,
      `Sujet : ${sujet}`,
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
      .map((ligne) => echapperHtml(ligne) || "&nbsp;")
      .join("<br/>");
    const html = `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#172e25;line-height:1.6">
<p>Nouveau message envoyé depuis la section Contact du portail SRE.</p>
<table role="presentation" style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Nom</td><td>${echapperHtml(nom)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Adresse e-mail</td><td><a href="mailto:${echapperHtml(courriel)}">${echapperHtml(courriel)}</a></td></tr>
<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Sujet</td><td>${echapperHtml(sujet)}</td></tr>
</table>
<h2 style="font-size:16px">Message</h2><p>${htmlMessage}</p>
${appUrl ? `<p><a href="${echapperHtml(appUrl)}">Ouvrir le portail SRE</a></p>` : ""}
<p style="font-size:12px;color:#71838a">Répondez à cet e-mail pour contacter l’expéditeur. Message transmis via le formulaire public SRE.</p>
</body></html>`;

    const resultats = await Promise.allSettled(
      administrateurs.map((administrateur) =>
        this.courriels.envoyer({
          destinataire: administrateur.courriel,
          nomDestinataire: administrateur.nom,
          replyTo: courriel,
          sujet: `[Contact SRE] ${sujet}`,
          texte,
          html,
        }),
      ),
    );
    const envoyes = resultats.filter(
      (resultat) => resultat.status === "fulfilled",
    ).length;
    if (!envoyes) {
      throw new ServiceUnavailableException(
        "Le message n’a pas pu être transmis. Réessayez plus tard.",
      );
    }

    // En mode capture, l'e-mail est uniquement conservé en mémoire pour les
    // tests et le développement : ne prétendons pas qu'il est parti réellement.
    const mode = this.configuration
      .get<string>("MAIL_TRANSPORT", "")
      .toLowerCase();
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
}
