import { createHash, randomBytes } from "crypto";
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

/** Empreinte SHA-256 d'un jeton (le jeton en clair n'est jamais stocké). */
export function empreinteJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

export interface DemandeActivationVue {
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

/**
 * Jetons d'activation / de réinitialisation à usage limité et à expiration
 * contrôlée, et envoi suivi des courriels de première connexion.
 * - le jeton en clair n'existe que dans le courriel (empreinte SHA-256 stockée) ;
 * - chaque envoi est suivi (statut, tentatives, erreur) et réessayable ;
 * - un jeton consommé ou expiré est refusé, sans exception.
 */
@Injectable()
export class ActivationService {
  private readonly journal = new Logger(ActivationService.name);

  constructor(
    @InjectRepository(ActivationRequestEntity)
    private readonly demandes: Repository<ActivationRequestEntity>,
    private readonly configuration: ConfigService,
    @Inject(MAIL_SERVICE) private readonly courriels: MailSender,
  ) {}

  private dureeValiditeMs(): number {
    const heures = Number(
      this.configuration.get<string>("ACTIVATION_TOKEN_TTL_HOURS", "72"),
    );
    return Math.max(1, heures) * 60 * 60 * 1000;
  }

  private adresseApplication(): string {
    return (
      this.configuration.get<string>("APP_URL", "").trim().replace(/\/+$/, "") ||
      ""
    );
  }

  /**
   * Crée la demande d'activation d'un compte (jeton + courriel de première
   * connexion) et tente l'envoi immédiat. Retourne la vue de la demande,
   * jamais le jeton en clair.
   */
  async creerDemandeActivation(
    utilisateur: UserEntity,
    libelle: string,
    numeroStatProvisoire?: string | null,
  ): Promise<DemandeActivationVue> {
    const ancienne = await this.demandes.findOne({
      where: {
        utilisateurId: utilisateur.id,
        type: ActivationTokenType.ACTIVATION,
        utiliseLe: IsNull(),
      },
      order: { creeLe: "DESC" },
    });
    if (ancienne && ancienne.expireLe.getTime() > Date.now()) {
      // Idempotence : réutilise la demande active au lieu d'en créer une seconde.
      await this.envoyerCourrielActivation(ancienne.id);
      return this.vue(await this.recharger(ancienne.id));
    }

    const jeton = randomBytes(32).toString("hex");
    const demande = this.demandes.create({
      utilisateur,
      utilisateurId: utilisateur.id,
      type: ActivationTokenType.ACTIVATION,
      jetonHash: empreinteJeton(jeton),
      expireLe: new Date(Date.now() + this.dureeValiditeMs()),
      utiliseLe: null,
      destinataire: utilisateur.courriel,
      statutCourriel: ActivationEmailStatus.EN_ATTENTE,
      tentativesEnvoi: 0,
    });
    const enregistree = await this.demandes.save(demande);
    await this.envoyerCourrielActivation(enregistree.id, jeton, libelle, numeroStatProvisoire);
    return this.vue(await this.recharger(enregistree.id));
  }

  /** (Ré)envoie le courriel lié à une demande et met à jour le suivi d'envoi. */
  async envoyerCourrielActivation(
    demandeId: string,
    jetonConnu?: string,
    libelleConnu?: string,
    statProvisoire?: string | null,
  ): Promise<DemandeActivationVue> {
    const demande = await this.recharger(demandeId);
    const utilisateur = demande.utilisateur;
    const jeton =
      jetonConnu ??
      // En réessai, le jeton en clair n'est plus disponible : un nouveau jeton
      // est émis (le précédent est invalidé) pour ne jamais réutiliser d'empreinte
      // ni stocker de secret en clair.
      this.emettreNouveauJeton(demande);
    const libelle =
      libelleConnu ??
      utilisateur.contribuable?.raisonSociale ??
      utilisateur.contribuable?.nom ??
      utilisateur.nom;
    const appUrl = this.adresseApplication();
    const lienActivation = `${appUrl}/activation?jeton=${jeton}`;
    const lienSite = appUrl || "#";
    const motProvisoire = statProvisoire ?? null;

    demande.tentativesEnvoi += 1;
    demande.derniereTentativeLe = new Date();
    try {
      await this.courriels.envoyer({
        destinataire: demande.destinataire,
        nomDestinataire: libelle,
        sujet: "Portail SRE — activation de votre espace entreprise",
        texte: [
          `Bonjour ${libelle},`,
          "",
          "Votre espace entreprise a été créé sur le portail SRE.",
          `Adresse e-mail de connexion : ${demande.destinataire}`,
          motProvisoire
            ? `Mot de passe provisoire : ${motProvisoire} (temporaire — à changer dès la première connexion).`
            : "",
          "",
          "Première connexion (recommandée) : ouvrez le lien sécurisé ci-dessous",
          "pour définir votre mot de passe personnel et compléter votre profil :",
          lienActivation,
          `Ce lien est à usage unique et expire le ${demande.expireLe.toLocaleString("fr-FR")}.`,
          "",
          "Vous pouvez aussi vous connecter depuis le site officiel :",
          lienSite,
          "",
          "Tant que la configuration initiale n'est pas terminée, l'accès aux",
          "fonctionnalités métier reste bloqué.",
          "",
          "Message automatique du portail SRE. Ne répondez pas à cet e-mail.",
        ]
          .filter(Boolean)
          .join("\n"),
        html: this.courrielActivationHtml({
          libelle,
          destinataire: demande.destinataire,
          motProvisoire,
          lienActivation,
          lienSite,
          expireLe: demande.expireLe,
        }),
      });
      demande.statutCourriel = ActivationEmailStatus.ENVOYEE;
      demande.derniereErreur = null;
    } catch (cause) {
      demande.statutCourriel = ActivationEmailStatus.ECHEC;
      demande.derniereErreur =
        cause instanceof Error ? cause.message.slice(0, 254) : "Envoi impossible";
      this.journal.warn(
        `Envoi du courriel d'activation impossible pour ${demande.destinataire} : ${demande.derniereErreur}`,
      );
    }
    await this.demandes.save(demande);
    return this.vue(demande);
  }

  /**
   * Crée une demande de réinitialisation de mot de passe (jeton à usage
   * unique) et envoie le courriel sécurisé. Aucune information sur
   * l'existence du compte ne sort de cette méthode.
   */
  async creerDemandeReinitialisation(
    utilisateur: UserEntity,
  ): Promise<DemandeActivationVue> {
    const jeton = randomBytes(32).toString("hex");
    const demande = this.demandes.create({
      utilisateur,
      utilisateurId: utilisateur.id,
      type: ActivationTokenType.REINITIALISATION,
      jetonHash: empreinteJeton(jeton),
      expireLe: new Date(
        Date.now() + Math.min(this.dureeValiditeMs(), 24 * 60 * 60 * 1000),
      ),
      utiliseLe: null,
      destinataire: utilisateur.courriel,
      statutCourriel: ActivationEmailStatus.EN_ATTENTE,
      tentativesEnvoi: 0,
    });
    await this.demandes.save(demande);
    const appUrl = this.adresseApplication();
    const lien = `${appUrl}/reinitialisation-mot-de-passe?jeton=${jeton}`;
    demande.tentativesEnvoi += 1;
    demande.derniereTentativeLe = new Date();
    try {
      await this.courriels.envoyer({
        destinataire: demande.destinataire,
        nomDestinataire: utilisateur.nom,
        sujet: "Portail SRE — réinitialisation de votre mot de passe",
        texte: [
          `Bonjour ${utilisateur.nom},`,
          "",
          "Une réinitialisation de mot de passe a été demandée pour votre compte.",
          "Ouvrez le lien sécurisé ci-dessous pour définir un nouveau mot de passe :",
          lien,
          `Ce lien est à usage unique et expire le ${demande.expireLe.toLocaleString("fr-FR")}.`,
          "",
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
          "",
          "Message automatique du portail SRE. Ne répondez pas à cet e-mail.",
        ].join("\n"),
        html: buildEmailHtml({
          nomDestinataire: utilisateur.nom,
          titre: "Réinitialisation de votre mot de passe",
          message: `Ouvrez ce lien sécurisé pour définir un nouveau mot de passe. Il est à usage unique et expire le ${demande.expireLe.toLocaleString("fr-FR")}. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
          lienApplication: lien,
          libelleLien: "Réinitialiser mon mot de passe",
        }),
      });
      demande.statutCourriel = ActivationEmailStatus.ENVOYEE;
      demande.derniereErreur = null;
    } catch (cause) {
      demande.statutCourriel = ActivationEmailStatus.ECHEC;
      demande.derniereErreur =
        cause instanceof Error ? cause.message.slice(0, 254) : "Envoi impossible";
    }
    await this.demandes.save(demande);
    return this.vue(demande);
  }

  /** Admin : liste des courriels d'activation avec statut d'envoi. */
  async listerDemandes(): Promise<DemandeActivationVue[]> {
    const liste = await this.demandes.find({
      relations: { utilisateur: { contribuable: true } },
      order: { creeLe: "DESC" },
    });
    return liste.map((demande) => this.vue(demande));
  }

  /** Admin : réessai d'envoi d'un courriel d'activation en échec. */
  async renvoyer(demandeId: string): Promise<DemandeActivationVue> {
    const demande = await this.demandes.findOne({
      where: { id: demandeId },
    });
    if (!demande) throw new NotFoundException("Courriel d'activation introuvable.");
    return this.envoyerCourrielActivation(demandeId);
  }

  /**
   * Valide un jeton (type, expiration, usage unique) et retourne la demande.
   * `consumer` marque le jeton comme utilisé (à appeler après traitement).
   */
  async validerJeton(
    jeton: string,
    type: ActivationTokenType,
    consumer = false,
  ): Promise<ActivationRequestEntity> {
    const demande = await this.demandes.findOne({
      where: { jetonHash: empreinteJeton(jeton.trim()) },
      relations: { utilisateur: true },
    });
    if (
      !demande ||
      demande.type !== type ||
      demande.utiliseLe !== null ||
      demande.expireLe.getTime() < Date.now()
    ) {
      throw new NotFoundException(
        "Lien invalide, déjà utilisé ou expiré. Demandez un nouveau lien.",
      );
    }
    if (consumer) {
      demande.utiliseLe = new Date();
      await this.demandes.save(demande);
    }
    return demande;
  }

  /** Remplace l'empreinte d'une demande active par un jeton neuf (réessai). */
  private emettreNouveauJeton(demande: ActivationRequestEntity): string {
    const jeton = randomBytes(32).toString("hex");
    demande.jetonHash = empreinteJeton(jeton);
    if (demande.expireLe.getTime() < Date.now()) {
      demande.expireLe = new Date(Date.now() + this.dureeValiditeMs());
    }
    return jeton;
  }

  private async recharger(id: string): Promise<ActivationRequestEntity> {
    const demande = await this.demandes.findOne({
      where: { id },
      relations: { utilisateur: { contribuable: true } },
    });
    if (!demande) throw new NotFoundException("Courriel d'activation introuvable.");
    return demande;
  }

  private vue(demande: ActivationRequestEntity): DemandeActivationVue {
    const utilisateur = demande.utilisateur;
    return {
      id: demande.id,
      utilisateurId: demande.utilisateurId,
      nom:
        utilisateur?.contribuable?.raisonSociale ??
        utilisateur?.contribuable?.nom ??
        utilisateur?.nom ??
        "",
      destinataire: demande.destinataire,
      type: demande.type,
      statutCourriel: demande.statutCourriel,
      tentativesEnvoi: demande.tentativesEnvoi,
      derniereTentativeLe: demande.derniereTentativeLe,
      derniereErreur: demande.derniereErreur,
      expireLe: demande.expireLe,
      utiliseLe: demande.utiliseLe,
      creeLe: demande.creeLe,
    };
  }

  private courrielActivationHtml(parametres: {
    libelle: string;
    destinataire: string;
    motProvisoire: string | null;
    lienActivation: string;
    lienSite: string;
    expireLe: Date;
  }): string {
    const e = (valeur: string) =>
      valeur
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const credentiel = parametres.motProvisoire
      ? `<p><strong>Adresse e-mail :</strong> ${e(parametres.destinataire)}<br/><strong>Mot de passe provisoire :</strong> ${e(parametres.motProvisoire)} <em>(temporaire — à changer dès la première connexion)</em></p>`
      : `<p><strong>Adresse e-mail :</strong> ${e(parametres.destinataire)}</p>`;
    return `<!doctype html><html lang="fr"><body style="font-family:Arial,sans-serif;color:#18283c;line-height:1.55">
<p>Bonjour ${e(parametres.libelle)},</p>
<h1 style="font-size:18px">Votre espace entreprise est prêt</h1>
<p>Votre compte a été créé sur le portail SRE. Voici vos informations d'accès :</p>
${credentiel}
<p><strong>Première connexion (recommandée)</strong> : ouvrez ce lien sécurisé pour définir votre mot de passe personnel et compléter votre profil :</p>
<p style="margin:18px 0"><a href="${e(parametres.lienActivation)}" style="background:#1d6a50;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Activer mon espace</a></p>
<p style="font-size:12px;color:#5b6b7a">Ce lien est à usage unique et expire le ${e(parametres.expireLe.toLocaleString("fr-FR"))}.</p>
<p>Vous pouvez aussi vous connecter depuis le site officiel : <a href="${e(parametres.lienSite)}">${e(parametres.lienSite)}</a></p>
<p>Tant que la configuration initiale n'est pas terminée, l'accès aux fonctionnalités métier reste bloqué.</p>
<p style="font-size:12px;color:#5b6b7a">Message automatique du portail SRE. Ne répondez pas à cet e-mail et ne transmettez jamais votre mot de passe.</p>
</body></html>`;
  }
}
