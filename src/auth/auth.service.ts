import { createHash, randomInt } from "crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource, Repository } from "typeorm";
import { LoginAttemptEntity } from "../database/entities/login-attempt.entity";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { UserEntity } from "../database/entities/user.entity";
import { AccountRole, AccountStatus } from "../database/enums";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  MAIL_SERVICE,
  MailSender,
  buildEmailHtml,
} from "../notifications/mail.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ConfigurationInitialeDto } from "./dto/configuration-initiale.dto";
import { ActivationConfirmationDto } from "./dto/activation-confirmation.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationDto } from "./dto/registration.dto";
import {
  ActivationService,
} from "../notifications/activation.service";
import { ActivationTokenType } from "../database/enums";

/** Messages explicites distincts (nouvelle politique d'authentification). */
const MESSAGE_COMPTE_INTROUVABLE =
  "Aucun compte n'est associé à cette adresse e-mail.";
const MESSAGE_COMPTE_INACTIF =
  "Ce compte n'est pas activé ou a été désactivé. Contactez l'administration.";
const MESSAGE_MOT_DE_PASSE_INVALIDE =
  "Identifiants invalides : mot de passe incorrect.";

const DUREE_VALIDITE_CODE_VERIFICATION_MS = 24 * 60 * 60 * 1000;

/** Empreinte SHA-256 du code de vérification (jamais stockée en clair). */
function empreinteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly utilisateurs: Repository<UserEntity>,
    @InjectRepository(LoginAttemptEntity)
    private readonly tentativesConnexion: Repository<LoginAttemptEntity>,
    private readonly sourceDeDonnees: DataSource,
    private readonly jetons: JwtService,
    private readonly configuration: ConfigService,
    private readonly activation: ActivationService,
    @Inject(MAIL_SERVICE) private readonly courriels: MailSender,
  ) {}

  async obtenirEtatInscription() {
    return {
      administrateurInitialise: await this.utilisateurs.exist({
        where: { role: AccountRole.ADMIN },
      }),
    };
  }

  async inscrire(donnees: RegistrationDto) {
    const courriel = donnees.courriel.trim().toLowerCase();
    const resultat = await this.sourceDeDonnees.transaction(
      async (gestionnaire) => {
        // Le verrou transactionnel empêche deux inscriptions simultanées d'obtenir le rôle administrateur initial.
        await gestionnaire.query("SELECT pg_advisory_xact_lock($1)", [
          2026101201,
        ]);
        const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
        const nombreUtilisateurs = await depotUtilisateurs.count();
        const role =
          nombreUtilisateurs === 0 ? AccountRole.ADMIN : AccountRole.CLIENT;

        if (await depotUtilisateurs.exist({ where: { courriel } })) {
          throw new ConflictException(
            "Cette adresse courriel est déjà utilisée.",
          );
        }
        if (role === AccountRole.CLIENT && !donnees.profil) {
          throw new BadRequestException(
            "Un profil contribuable est requis pour créer un compte client.",
          );
        }
        if (
          donnees.profil &&
          donnees.profil.courriel.trim().toLowerCase() !== courriel
        ) {
          throw new BadRequestException(
            "L'adresse courriel du profil doit correspondre à celle du compte.",
          );
        }
        if (role === AccountRole.CLIENT && donnees.profil) {
          const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
          const nif = donnees.profil.nif?.trim().toUpperCase();
          const stat = donnees.profil.stat?.trim().toUpperCase();
          if (nif && (await depotContribuables.exist({ where: { nif } }))) {
            throw new ConflictException("Ce NIF est déjà associé à un profil.");
          }
          if (stat && (await depotContribuables.exist({ where: { stat } }))) {
            throw new ConflictException(
              "Ce STAT est déjà associé à un profil.",
            );
          }
        }

        const nombreTours = Number(
          this.configuration.get<string>("BCRYPT_ROUNDS", "12"),
        );
        const nouvelUtilisateur = depotUtilisateurs.create({
          nom: donnees.nom.trim(),
          courriel,
          motDePasseHash: await bcrypt.hash(donnees.motDePasse, nombreTours),
          role,
          statut: AccountStatus.ACTIF,
          changementMotDePasseRequis: false,
          derniereConnexion: new Date(),
        });
        await depotUtilisateurs.save(nouvelUtilisateur);

        let contribuable: TaxpayerEntity | null = null;
        if (role === AccountRole.CLIENT && donnees.profil) {
          const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
          const profil = donnees.profil;
          contribuable = depotContribuables.create({
            utilisateur: nouvelUtilisateur,
            type: profil.type,
            nom: profil.nom.trim(),
            prenom: profil.prenom?.trim() || null,
            raisonSociale: profil.raisonSociale?.trim() || null,
            nomCommercial: profil.nomCommercial?.trim() || null,
            nif: profil.nif?.trim().toUpperCase() || null,
            stat: profil.stat?.trim().toUpperCase() || null,
            adresse: profil.adresse.trim(),
            region: profil.region.trim(),
            ville: profil.ville.trim(),
            courriel,
            telephone: profil.telephone.trim(),
            representantLegal: profil.representantLegal?.trim() || null,
            nomContact: profil.nomContact?.trim() || null,
            prenomContact: profil.prenomContact?.trim() || null,
            fonctionContact: profil.fonctionContact?.trim() || null,
            dateCreationCompte: new Date(),
          });
          await depotContribuables.save(contribuable);
        }
        return { utilisateur: nouvelUtilisateur, contribuable };
      },
    );

    return this.reponseAvecJeton(
      resultat.utilisateur,
      resultat.contribuable?.id,
    );
  }

  /**
   * Authentification : e-mail + mot de passe uniquement.
   * - première connexion : le mot de passe provisoire est celui transmis lors
   *   de la création du compte (le numéro STAT sert de mot de passe initial et
   *   n'est plus une pièce d'identité séparée) ;
   * - connexions suivantes : le mot de passe personnel défini par l'utilisateur ;
   * - chaque tentative est journalisée (sans secret) et limitée dans le temps.
   */
  async connecter(donnees: LoginDto, adresseIp?: string | null) {
    const courriel = donnees.courriel.trim().toLowerCase();

    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
      .where("LOWER(utilisateur.courriel) = :courriel", { courriel })
      .getOne();

    let motif = "compte_introuvable";
    try {
      if (!utilisateur) {
        throw new UnauthorizedException(MESSAGE_COMPTE_INTROUVABLE);
      }
      if (utilisateur.statut !== AccountStatus.ACTIF) {
        motif = "compte_inactif";
        throw new UnauthorizedException(MESSAGE_COMPTE_INACTIF);
      }
      if (
        !(await bcrypt.compare(donnees.motDePasse, utilisateur.motDePasseHash))
      ) {
        motif = "mot_de_passe";
        throw new UnauthorizedException(MESSAGE_MOT_DE_PASSE_INVALIDE);
      }

      motif = "ok";
      utilisateur.derniereConnexion = new Date();
      await this.utilisateurs.save(utilisateur);
      await this.journaliserTentative(courriel, true, "ok", adresseIp);
      return this.reponseAvecJeton(
        utilisateur,
        utilisateur.contribuable?.id,
      );
    } catch (cause) {
      await this.journaliserTentative(courriel, false, motif, adresseIp);
      throw cause;
    }
  }

  private async journaliserTentative(
    courriel: string,
    succes: boolean,
    motif: string,
    adresseIp?: string | null,
  ) {
    try {
      await this.tentativesConnexion.insert({
        courriel: courriel.slice(0, 254),
        succes,
        motif: motif.slice(0, 120),
        adresseIp: adresseIp?.slice(0, 64) ?? null,
      });
    } catch {
      // Le journal ne doit jamais faire échouer l'authentification.
    }
  }

  /**
   * Demande de vérification d'adresse e-mail : code à usage unique valable
   * 24 h, stocké sous forme d'empreinte. La réponse est identique que le
   * compte existe ou non (aucune énumération de comptes).
   */
  async demanderVerificationCourriel(courriel: string) {
    const adresse = courriel.trim().toLowerCase();
    const utilisateur = await this.utilisateurs.findOne({
      where: { courriel: adresse },
      select: ["id", "nom", "courriel", "courrielVerifie"],
    });
    const reponse = {
      message:
        "Si un compte correspond à cette adresse et qu'un transport de courriel est configuré, un code de vérification a été envoyé.",
    };
    if (!utilisateur || utilisateur.courrielVerifie) return reponse;

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    utilisateur.verificationCourrielCodeHash = empreinteCode(code);
    utilisateur.verificationCourrielExpireLe = new Date(
      Date.now() + DUREE_VALIDITE_CODE_VERIFICATION_MS,
    );
    await this.utilisateurs.save(utilisateur);

    try {
      const appUrl = this.configuration.get<string>("APP_URL", "");
      await this.courriels.envoyer({
        destinataire: utilisateur.courriel,
        nomDestinataire: utilisateur.nom,
        sujet: "Portail SRE — code de vérification de votre adresse e-mail",
        texte: `Bonjour ${utilisateur.nom},\n\nVotre code de vérification est : ${code}\nIl expire dans 24 heures.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nMessage automatique du portail SRE. Ne répondez pas à cet e-mail.`,
        html: buildEmailHtml({
          nomDestinataire: utilisateur.nom,
          titre: "Vérification de votre adresse e-mail",
          message: `Votre code de vérification est : ${code}. Il expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
          lienApplication: appUrl || "#",
        }),
      });
    } catch {
      // Sans transport configuré, le code reste valable côté serveur mais
      // aucun envoi n'est annoncé comme réussi.
    }
    return reponse;
  }

  /** Valide le code à usage unique et marque l'adresse comme vérifiée. */
  async verifierCourriel(courriel: string, code: string) {
    const adresse = courriel.trim().toLowerCase();
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.verificationCourrielCodeHash")
      .addSelect("utilisateur.verificationCourrielExpireLe")
      .where("LOWER(utilisateur.courriel) = :courriel", { courriel: adresse })
      .getOne();
    if (
      !utilisateur ||
      !utilisateur.verificationCourrielCodeHash ||
      !utilisateur.verificationCourrielExpireLe ||
      utilisateur.verificationCourrielExpireLe.getTime() < Date.now() ||
      utilisateur.verificationCourrielCodeHash !== empreinteCode(code.trim())
    ) {
      throw new BadRequestException(
        "Code de vérification invalide ou expiré. Demandez un nouveau code.",
      );
    }
    utilisateur.courrielVerifie = true;
    utilisateur.verificationCourrielCodeHash = null;
    utilisateur.verificationCourrielExpireLe = null;
    await this.utilisateurs.save(utilisateur);
    return { message: "Adresse e-mail vérifiée.", courrielVerifie: true };
  }

  async obtenirMonCompte(idUtilisateur: string) {
    const utilisateur = await this.utilisateurs.findOne({
      where: { id: idUtilisateur },
      relations: { contribuable: true },
    });
    if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) {
      throw new UnauthorizedException("Ce compte n'est plus actif.");
    }
    return this.vuePublique(utilisateur, utilisateur.contribuable?.id);
  }

  async changerMotDePasse(idUtilisateur: string, donnees: ChangePasswordDto) {
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .where("utilisateur.id = :idUtilisateur", { idUtilisateur })
      .getOne();
    if (!utilisateur) throw new UnauthorizedException("Compte introuvable.");
    if (
      !(await bcrypt.compare(
        donnees.motDePasseActuel,
        utilisateur.motDePasseHash,
      ))
    ) {
      throw new BadRequestException("Le mot de passe actuel est incorrect.");
    }

    utilisateur.motDePasseHash = await bcrypt.hash(
      donnees.nouveauMotDePasse,
      Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
    );
    utilisateur.changementMotDePasseRequis = false;
    await this.utilisateurs.save(utilisateur);
    return { message: "Le mot de passe a été modifié." };
  }

  /**
   * Configuration initiale (première connexion) : remplace le mot de passe
   * provisoire (numéro STAT transmis à la création) par un mot de passe
   * personnel, valide le profil et débloque l'espace — en une seule
   * transaction. Le mot de passe provisoire est définitivement invalidé.
   */
  async configurerPremiereConnexion(
    idUtilisateur: string,
    donnees: ConfigurationInitialeDto,
  ) {
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
      .where("utilisateur.id = :idUtilisateur", { idUtilisateur })
      .getOne();
    if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) {
      throw new UnauthorizedException("Ce compte n'est pas actif.");
    }
    if (
      !utilisateur.changementMotDePasseRequis &&
      utilisateur.profilComplete
    ) {
      throw new BadRequestException(
        "La configuration initiale de ce compte est déjà terminée. Utilisez le changement de mot de passe.",
      );
    }
    if (
      !(await bcrypt.compare(
        donnees.motDePasseActuel,
        utilisateur.motDePasseHash,
      ))
    ) {
      throw new BadRequestException("Le mot de passe actuel est incorrect.");
    }

    await this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
      utilisateur.motDePasseHash = await bcrypt.hash(
        donnees.nouveauMotDePasse,
        Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
      );
      utilisateur.changementMotDePasseRequis = false;
      utilisateur.profilComplete = true;
      await depotUtilisateurs.save(utilisateur);

      if (utilisateur.contribuable && donnees.profil) {
        const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
        const profil = utilisateur.contribuable;
        if (donnees.profil.adresse !== undefined)
          profil.adresse = donnees.profil.adresse.trim();
        if (donnees.profil.ville !== undefined)
          profil.ville = donnees.profil.ville.trim();
        if (donnees.profil.telephone !== undefined)
          profil.telephone = donnees.profil.telephone.trim();
        if (donnees.profil.nomCommercial !== undefined)
          profil.nomCommercial = donnees.profil.nomCommercial.trim() || null;
        await depotContribuables.save(profil);
      }
    });

    return {
      message:
        "Configuration initiale terminée : votre mot de passe provisoire n'est plus valable.",
      changementMotDePasseRequis: false,
      profilComplete: true,
    };
  }

  /** Vue publique d'un lien d'activation (avant confirmation). */
  async consulterActivation(jeton: string) {
    const demande = await this.activation.validerJeton(
      jeton,
      ActivationTokenType.ACTIVATION,
    );
    const utilisateur = demande.utilisateur;
    const courriel = demande.destinataire;
    return {
      valide: true,
      courrielMasque: this.masquerCourriel(courriel),
      nom:
        utilisateur?.contribuable?.raisonSociale ??
        utilisateur?.contribuable?.nom ??
        utilisateur?.nom ??
        "",
      expireLe: demande.expireLe,
    };
  }

  /**
   * Confirmation d'un lien d'activation à usage unique : définit le mot de
   * passe personnel, valide le profil et invalide définitivement le jeton et
   * le mot de passe provisoire.
   */
  async confirmerActivation(jeton: string, donnees: ActivationConfirmationDto) {
    return this.sourceDeDonnees.transaction(async (gestionnaire) => {
      const demande = await this.activation.validerJeton(
        jeton,
        ActivationTokenType.ACTIVATION,
        true,
      );
      const depotUtilisateurs = gestionnaire.getRepository(UserEntity);
      const utilisateur = await depotUtilisateurs
        .createQueryBuilder("utilisateur")
        .addSelect("utilisateur.motDePasseHash")
        .leftJoinAndSelect("utilisateur.contribuable", "contribuable")
        .where("utilisateur.id = :id", { id: demande.utilisateurId })
        .getOne();
      if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) {
        throw new UnauthorizedException("Ce compte n'est pas actif.");
      }
      utilisateur.motDePasseHash = await bcrypt.hash(
        donnees.nouveauMotDePasse,
        Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
      );
      utilisateur.changementMotDePasseRequis = false;
      utilisateur.profilComplete = true;
      await depotUtilisateurs.save(utilisateur);

      if (utilisateur.contribuable && donnees.profil) {
        const depotContribuables = gestionnaire.getRepository(TaxpayerEntity);
        const profil = utilisateur.contribuable;
        if (donnees.profil.adresse !== undefined)
          profil.adresse = donnees.profil.adresse.trim();
        if (donnees.profil.ville !== undefined)
          profil.ville = donnees.profil.ville.trim();
        if (donnees.profil.telephone !== undefined)
          profil.telephone = donnees.profil.telephone.trim();
        if (donnees.profil.nomCommercial !== undefined)
          profil.nomCommercial = donnees.profil.nomCommercial.trim() || null;
        await depotContribuables.save(profil);
      }
      return {
        message:
          "Votre espace est activé. Connectez-vous avec votre adresse e-mail et votre nouveau mot de passe.",
      };
    });
  }

  /**
   * Demande de réinitialisation du mot de passe : la réponse est toujours la
   * même (aucune énumération de comptes) ; un lien à usage unique est envoyé
   * si un compte actif correspond.
   */
  async demanderReinitialisation(courriel: string) {
    const adresse = courriel.trim().toLowerCase();
    const reponse = {
      message:
        "Si un compte actif correspond à cette adresse, un lien de réinitialisation a été envoyé.",
    };
    const utilisateur = await this.utilisateurs.findOne({
      where: { courriel: adresse },
    });
    if (!utilisateur || utilisateur.statut !== AccountStatus.ACTIF) return reponse;
    await this.activation.creerDemandeReinitialisation(utilisateur);
    return reponse;
  }

  /** Réinitialisation via le jeton à usage unique reçu par courriel. */
  async reinitialiserMotDePasse(jeton: string, nouveauMotDePasse: string) {
    const demande = await this.activation.validerJeton(
      jeton,
      ActivationTokenType.REINITIALISATION,
      true,
    );
    const utilisateur = await this.utilisateurs
      .createQueryBuilder("utilisateur")
      .addSelect("utilisateur.motDePasseHash")
      .where("utilisateur.id = :id", { id: demande.utilisateurId })
      .getOne();
    if (!utilisateur) throw new UnauthorizedException("Compte introuvable.");
    utilisateur.motDePasseHash = await bcrypt.hash(
      nouveauMotDePasse,
      Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
    );
    utilisateur.changementMotDePasseRequis = false;
    await this.utilisateurs.save(utilisateur);
    return {
      message:
        "Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.",
    };
  }

  private masquerCourriel(courriel: string): string {
    const [avant, domaine] = courriel.split("@");
    if (!domaine) return courriel;
    const tete = avant.slice(0, 2);
    return `${tete}${"*".repeat(Math.max(1, avant.length - 2))}@${domaine}`;
  }

  private async reponseAvecJeton(
    utilisateur: UserEntity,
    idContribuable?: string,
  ) {
    const charge: AuthenticatedUser = {
      id: utilisateur.id,
      courriel: utilisateur.courriel,
      nom: utilisateur.nom,
      role: utilisateur.role,
      ...(idContribuable ? { contribuableId: idContribuable } : {}),
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
      profilComplete: utilisateur.profilComplete,
    };
    const accessToken = await this.jetons.signAsync(charge);
    return {
      accessToken,
      tokenType: "Bearer",
      utilisateur: this.vuePublique(utilisateur, idContribuable),
    };
  }

  private vuePublique(utilisateur: UserEntity, idContribuable?: string) {
    return {
      id: utilisateur.id,
      nom: utilisateur.nom,
      courriel: utilisateur.courriel,
      role: utilisateur.role,
      statut: utilisateur.statut,
      changementMotDePasseRequis: utilisateur.changementMotDePasseRequis,
      profilComplete: utilisateur.profilComplete,
      courrielVerifie: utilisateur.courrielVerifie,
      creeLe: utilisateur.creeLe,
      derniereConnexion: utilisateur.derniereConnexion,
      ...(idContribuable ? { contribuableId: idContribuable } : {}),
    };
  }
}
