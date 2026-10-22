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
import { InitialSetupDto } from "./dto/initial-setup.dto";
import { ActivationConfirmationDto } from "./dto/activation-confirmation.dto";
import { LoginDto } from "./dto/login.dto";
import { RegistrationDto } from "./dto/registration.dto";
import {
  ActivationService,
} from "../notifications/activation.service";
import { ActivationTokenType } from "../database/enums";

/** Distinct explicit messages (new authentication policy). */
const MESSAGE_ACCOUNT_NOT_FOUND =
  "Aucun compte n'est associé à cette adresse e-mail.";
const MESSAGE_ACCOUNT_INACTIVE =
  "Ce compte n'est pas activé ou a été désactivé. Contactez l'administration.";
const MESSAGE_PASSWORD_INVALID =
  "Identifiants invalides : mot de passe incorrect.";

const VERIFICATION_CODE_VALIDITY_MS = 24 * 60 * 60 * 1000;

/** SHA-256 fingerprint of the verification code (never stored in plain text). */
function empreinteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(LoginAttemptEntity)
    private readonly loginAttempts: Repository<LoginAttemptEntity>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly configuration: ConfigService,
    private readonly activation: ActivationService,
    @Inject(MAIL_SERVICE) private readonly emails: MailSender,
  ) {}

  async getRegistrationState() {
    return {
      administrateurInitialise: await this.users.exist({
        where: { role: AccountRole.ADMIN },
      }),
    };
  }

  async register(data: RegistrationDto) {
    const email = data.courriel.trim().toLowerCase();
    const result = await this.dataSource.transaction(
      async (manager) => {
        // The transactional lock prevents two simultaneous registrations from obtaining the initial administrator role.
        await manager.query("SELECT pg_advisory_xact_lock($1)", [
          2026101201,
        ]);
        const usersRepository = manager.getRepository(UserEntity);
        const userCount = await usersRepository.count();
        const role =
          userCount === 0 ? AccountRole.ADMIN : AccountRole.CLIENT;

        if (await usersRepository.exist({ where: { email } })) {
          throw new ConflictException(
            "Cette adresse courriel est déjà utilisée.",
          );
        }
        if (role === AccountRole.CLIENT && !data.profil) {
          throw new BadRequestException(
            "Un profil contribuable est requis pour créer un compte client.",
          );
        }
        if (
          data.profil &&
          data.profil.courriel.trim().toLowerCase() !== email
        ) {
          throw new BadRequestException(
            "L'adresse courriel du profil doit correspondre à celle du compte.",
          );
        }
        if (role === AccountRole.CLIENT && data.profil) {
          const taxpayersRepository = manager.getRepository(TaxpayerEntity);
          const nif = data.profil.nif?.trim().toUpperCase();
          const stat = data.profil.stat?.trim().toUpperCase();
          if (nif && (await taxpayersRepository.exist({ where: { nif } }))) {
            throw new ConflictException("Ce NIF est déjà associé à un profil.");
          }
          if (stat && (await taxpayersRepository.exist({ where: { stat } }))) {
            throw new ConflictException(
              "Ce STAT est déjà associé à un profil.",
            );
          }
        }

        const saltRounds = Number(
          this.configuration.get<string>("BCRYPT_ROUNDS", "12"),
        );
        const newUser = usersRepository.create({
          name: data.nom.trim(),
          email,
          passwordHash: await bcrypt.hash(data.motDePasse, saltRounds),
          role,
          status: AccountStatus.ACTIVE,
          mustChangePassword: false,
          lastLoginAt: new Date(),
        });
        await usersRepository.save(newUser);

        let taxpayer: TaxpayerEntity | null = null;
        if (role === AccountRole.CLIENT && data.profil) {
          const taxpayersRepository = manager.getRepository(TaxpayerEntity);
          const profile = data.profil;
          taxpayer = taxpayersRepository.create({
            user: newUser,
            type: profile.type,
            lastName: profile.nom.trim(),
            firstName: profile.prenom?.trim() || null,
            legalName: profile.raisonSociale?.trim() || null,
            tradeName: profile.nomCommercial?.trim() || null,
            nif: profile.nif?.trim().toUpperCase() || null,
            stat: profile.stat?.trim().toUpperCase() || null,
            address: profile.adresse.trim(),
            region: profile.region.trim(),
            city: profile.ville.trim(),
            email,
            phone: profile.telephone.trim(),
            legalRepresentative: profile.representantLegal?.trim() || null,
            contactLastName: profile.nomContact?.trim() || null,
            contactFirstName: profile.prenomContact?.trim() || null,
            contactRole: profile.fonctionContact?.trim() || null,
            accountCreatedAt: new Date(),
          });
          await taxpayersRepository.save(taxpayer);
        }
        return { utilisateur: newUser, contribuable: taxpayer };
      },
    );

    return this.buildTokenResponse(
      result.utilisateur,
      result.contribuable?.id,
    );
  }

  /**
   * Authentication: e-mail + password only.
   * - first sign-in: the provisional password is the one provided when
   *   the account was created (the STAT number serves as initial password and
   *   is no longer a separate identity document);
   * - subsequent sign-ins: the personal password set by the user;
   * - every attempt is logged (without secrets) and time-limited.
   */
  async logIn(data: LoginDto, ipAddress?: string | null) {
    const email = data.courriel.trim().toLowerCase();

    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .leftJoinAndSelect("user.taxpayer", "taxpayer")
      .where("LOWER(user.email) = :email", { email: email })
      .getOne();

    let reason = "compte_introuvable";
    try {
      if (!user) {
        throw new UnauthorizedException(MESSAGE_ACCOUNT_NOT_FOUND);
      }
      if (user.status !== AccountStatus.ACTIVE) {
        reason = "compte_inactif";
        throw new UnauthorizedException(MESSAGE_ACCOUNT_INACTIVE);
      }
      if (
        !(await bcrypt.compare(data.motDePasse, user.passwordHash))
      ) {
        reason = "mot_de_passe";
        throw new UnauthorizedException(MESSAGE_PASSWORD_INVALID);
      }

      reason = "ok";
      user.lastLoginAt = new Date();
      await this.users.save(user);
      await this.logAttempt(email, true, "ok", ipAddress);
      return this.buildTokenResponse(
        user,
        user.taxpayer?.id,
      );
    } catch (cause) {
      await this.logAttempt(email, false, reason, ipAddress);
      throw cause;
    }
  }

  private async logAttempt(
    email: string,
    success: boolean,
    reason: string,
    ipAddress?: string | null,
  ) {
    try {
      await this.loginAttempts.insert({
        email: email.slice(0, 254),
        success,
        reason: reason.slice(0, 120),
        ipAddress: ipAddress?.slice(0, 64) ?? null,
      });
    } catch {
      // The log must never make authentication fail.
    }
  }

  /**
   * E-mail address verification request: single-use code valid for
   * 24 h, stored as a fingerprint. The response is identical whether
   * the account exists or not (no account enumeration).
   */
  async requestEmailVerification(email: string) {
    const address = email.trim().toLowerCase();
    const user = await this.users.findOne({
      where: { email: address },
      select: ["id", "name", "email", "isEmailVerified"],
    });
    const response = {
      message:
        "Si un compte correspond à cette adresse et qu'un transport de courriel est configuré, un code de vérification a été envoyé.",
    };
    if (!user || user.isEmailVerified) return response;

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    user.emailVerificationCodeHash = empreinteCode(code);
    user.emailVerificationExpiresAt = new Date(
      Date.now() + VERIFICATION_CODE_VALIDITY_MS,
    );
    await this.users.save(user);

    try {
      const appUrl = this.configuration.get<string>("APP_URL", "");
      await this.emails.send({
        recipient: user.email,
        recipientName: user.name,
        subject: "Portail SRE — code de vérification de votre adresse e-mail",
        text: `Bonjour ${user.name},\n\nVotre code de vérification est : ${code}\nIl expire dans 24 heures.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\nMessage automatique du portail SRE. Ne répondez pas à cet e-mail.`,
        html: buildEmailHtml({
          recipientName: user.name,
          title: "Vérification de votre adresse e-mail",
          message: `Votre code de vérification est : ${code}. Il expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
          appLink: appUrl || "#",
        }),
      });
    } catch {
      // Without a configured transport, the code stays valid server-side but
      // no send is announced as successful.
    }
    return response;
  }

  /** Validates the single-use code and marks the address as verified. */
  async verifyEmail(email: string, code: string) {
    const address = email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.emailVerificationCodeHash")
      .addSelect("user.emailVerificationExpiresAt")
      .where("LOWER(user.email) = :email", { email: address })
      .getOne();
    if (
      !user ||
      !user.emailVerificationCodeHash ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now() ||
      user.emailVerificationCodeHash !== empreinteCode(code.trim())
    ) {
      throw new BadRequestException(
        "Code de vérification invalide ou expiré. Demandez un nouveau code.",
      );
    }
    user.isEmailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    await this.users.save(user);
    return { message: "Adresse e-mail vérifiée.", courrielVerifie: true };
  }

  async getMyAccount(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { taxpayer: true },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException("Ce compte n'est plus actif.");
    }
    return this.toPublicView(user, user.taxpayer?.id);
  }

  async changePassword(userId: string, data: ChangePasswordDto) {
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :userId", { userId: userId })
      .getOne();
    if (!user) throw new UnauthorizedException("Compte introuvable.");
    if (
      !(await bcrypt.compare(
        data.motDePasseActuel,
        user.passwordHash,
      ))
    ) {
      throw new BadRequestException("Le mot de passe actuel est incorrect.");
    }

    user.passwordHash = await bcrypt.hash(
      data.nouveauMotDePasse,
      Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
    );
    user.mustChangePassword = false;
    await this.users.save(user);
    return { message: "Le mot de passe a été modifié." };
  }

  /**
   * Initial setup (first sign-in): replaces the provisional
   * password (STAT number provided at creation) with a personal
   * password, validates the profile and unlocks the workspace — in a single
   * transaction. The provisional password is permanently invalidated.
   */
  async completeInitialSetup(
    userId: string,
    data: InitialSetupDto,
  ) {
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .leftJoinAndSelect("user.taxpayer", "taxpayer")
      .where("user.id = :userId", { userId: userId })
      .getOne();
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException("Ce compte n'est pas actif.");
    }
    if (
      !user.mustChangePassword &&
      user.isProfileComplete
    ) {
      throw new BadRequestException(
        "La configuration initiale de ce compte est déjà terminée. Utilisez le changement de mot de passe.",
      );
    }
    if (
      !(await bcrypt.compare(
        data.motDePasseActuel,
        user.passwordHash,
      ))
    ) {
      throw new BadRequestException("Le mot de passe actuel est incorrect.");
    }

    await this.dataSource.transaction(async (manager) => {
      const usersRepository = manager.getRepository(UserEntity);
      user.passwordHash = await bcrypt.hash(
        data.nouveauMotDePasse,
        Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
      );
      user.mustChangePassword = false;
      user.isProfileComplete = true;
      await usersRepository.save(user);

      if (user.taxpayer && data.profil) {
        const taxpayersRepository = manager.getRepository(TaxpayerEntity);
        const profile = user.taxpayer;
        if (data.profil.adresse !== undefined)
          profile.address = data.profil.adresse.trim();
        if (data.profil.ville !== undefined)
          profile.city = data.profil.ville.trim();
        if (data.profil.telephone !== undefined)
          profile.phone = data.profil.telephone.trim();
        if (data.profil.nomCommercial !== undefined)
          profile.tradeName = data.profil.nomCommercial.trim() || null;
        await taxpayersRepository.save(profile);
      }
    });

    return {
      message:
        "Configuration initiale terminée : votre mot de passe provisoire n'est plus valable.",
      changementMotDePasseRequis: false,
      profilComplete: true,
    };
  }

  /** Public view of an activation link (before confirmation). */
  async getActivationStatus(token: string) {
    const request = await this.activation.validateToken(
      token,
      ActivationTokenType.ACTIVATION,
    );
    const user = request.user;
    const email = request.recipient;
    return {
      valide: true,
      courrielMasque: this.maskEmail(email),
      nom:
        user?.taxpayer?.legalName ??
        user?.taxpayer?.lastName ??
        user?.name ??
        "",
      expireLe: request.expiresAt,
    };
  }

  /**
   * Confirmation of a single-use activation link: sets the personal
   * password, validates the profile and permanently invalidates the token and
   * the provisional password.
   */
  async confirmActivation(token: string, data: ActivationConfirmationDto) {
    return this.dataSource.transaction(async (manager) => {
      const request = await this.activation.validateToken(
        token,
        ActivationTokenType.ACTIVATION,
        true,
      );
      const usersRepository = manager.getRepository(UserEntity);
      const user = await usersRepository
        .createQueryBuilder("user")
        .addSelect("user.passwordHash")
        .leftJoinAndSelect("user.taxpayer", "taxpayer")
        .where("user.id = :id", { id: request.userId })
        .getOne();
      if (!user || user.status !== AccountStatus.ACTIVE) {
        throw new UnauthorizedException("Ce compte n'est pas actif.");
      }
      user.passwordHash = await bcrypt.hash(
        data.nouveauMotDePasse,
        Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
      );
      user.mustChangePassword = false;
      user.isProfileComplete = true;
      await usersRepository.save(user);

      if (user.taxpayer && data.profil) {
        const taxpayersRepository = manager.getRepository(TaxpayerEntity);
        const profile = user.taxpayer;
        if (data.profil.adresse !== undefined)
          profile.address = data.profil.adresse.trim();
        if (data.profil.ville !== undefined)
          profile.city = data.profil.ville.trim();
        if (data.profil.telephone !== undefined)
          profile.phone = data.profil.telephone.trim();
        if (data.profil.nomCommercial !== undefined)
          profile.tradeName = data.profil.nomCommercial.trim() || null;
        await taxpayersRepository.save(profile);
      }
      return {
        message:
          "Votre espace est activé. Connectez-vous avec votre adresse e-mail et votre nouveau mot de passe.",
      };
    });
  }

  /**
   * Password reset request: the response is always the
   * same (no account enumeration); a single-use link is sent
   * if an active account matches.
   */
  async requestPasswordReset(email: string) {
    const address = email.trim().toLowerCase();
    const response = {
      message:
        "Si un compte actif correspond à cette adresse, un lien de réinitialisation a été envoyé.",
    };
    const user = await this.users.findOne({
      where: { email: address },
    });
    if (!user || user.status !== AccountStatus.ACTIVE) return response;
    await this.activation.createPasswordResetRequest(user);
    return response;
  }

  /** Reset through the single-use token received by e-mail. */
  async resetPassword(token: string, newPassword: string) {
    const request = await this.activation.validateToken(
      token,
      ActivationTokenType.PASSWORD_RESET,
      true,
    );
    const user = await this.users
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.id = :id", { id: request.userId })
      .getOne();
    if (!user) throw new UnauthorizedException("Compte introuvable.");
    user.passwordHash = await bcrypt.hash(
      newPassword,
      Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12")),
    );
    user.mustChangePassword = false;
    await this.users.save(user);
    return {
      message:
        "Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe.",
    };
  }

  private maskEmail(email: string): string {
    const [localPart, domain] = email.split("@");
    if (!domain) return email;
    const visiblePrefix = localPart.slice(0, 2);
    return `${visiblePrefix}${"*".repeat(Math.max(1, localPart.length - 2))}@${domain}`;
  }

  private async buildTokenResponse(
    user: UserEntity,
    taxpayerId?: string,
  ) {
    // Token claim names (serialized format): kept as-is.
    const payload = {
      id: user.id,
      courriel: user.email,
      nom: user.name,
      role: user.role,
      ...(taxpayerId ? { contribuableId: taxpayerId } : {}),
      changementMotDePasseRequis: user.mustChangePassword,
      profilComplete: user.isProfileComplete,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      tokenType: "Bearer",
      utilisateur: this.toPublicView(user, taxpayerId),
    };
  }

  private toPublicView(user: UserEntity, taxpayerId?: string) {
    return {
      id: user.id,
      nom: user.name,
      courriel: user.email,
      role: user.role,
      statut: user.status,
      changementMotDePasseRequis: user.mustChangePassword,
      profilComplete: user.isProfileComplete,
      courrielVerifie: user.isEmailVerified,
      creeLe: user.createdAt,
      derniereConnexion: user.lastLoginAt,
      ...(taxpayerId ? { contribuableId: taxpayerId } : {}),
    };
  }
}
