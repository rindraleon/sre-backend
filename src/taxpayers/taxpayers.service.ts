import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcryptjs";
import { DataSource, Repository } from "typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  AccountRole,
  AccountStatus,
  ActivationEmailStatus,
  TaxpayerType,
} from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AcknowledgmentService } from "../notifications/acknowledgment.service";
import { ActivationService } from "../notifications/activation.service";
import { AdminNotificationService } from "../notifications/admin-notification.service";
import { isValidEmail } from "../notifications/mail.service";
import { CreateTaxpayerDto } from "./dto/create-taxpayer.dto";
import { UpdateTaxpayerProfileDto } from "./dto/update-taxpayer-profile.dto";

/** Detailed status of an Excel import row. */
export interface ImportRowResult {
  ligne: number;
  libelle: string;
  statut: "COMPTE_CREE" | "PROFIL_CREE" | "DOUBLON" | "REJETE";
  motif?: string;
  erreurs?: string[];
  profilId?: string;
  compteId?: string;
  statutCourriel?: string;
}

@Injectable()
export class TaxpayersService {
  constructor(
    @InjectRepository(TaxpayerEntity)
    private readonly taxpayers: Repository<TaxpayerEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly configuration: ConfigService,
    private readonly activation: ActivationService,
    @Optional()
    private readonly adminNotifications?: AdminNotificationService,
    @Optional()
    private readonly acknowledgments?: AcknowledgmentService,
  ) {}

  async getMyProfile(user: AuthenticatedUser) {
    if (!user.taxpayerId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const taxpayer = await this.taxpayers.findOne({
      where: { id: user.taxpayerId, region: SRE_REGION },
      relations: { user: true },
    });
    if (!taxpayer)
      throw new NotFoundException(
        "Profil contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.toTaxpayerView(taxpayer);
  }

  async updateMyProfile(
    user: AuthenticatedUser,
    data: UpdateTaxpayerProfileDto,
  ) {
    if (!user.taxpayerId)
      throw new NotFoundException(
        "Aucun profil contribuable n'est lié à ce compte.",
      );
    const taxpayer = await this.taxpayers.findOne({
      where: { id: user.taxpayerId, region: SRE_REGION },
      relations: { user: true },
    });
    if (!taxpayer)
      throw new NotFoundException("Profil contribuable introuvable.");
    if (
      data.nomCommercial !== undefined &&
      taxpayer.type !== "ENTREPRISE"
    ) {
      throw new BadRequestException(
        "Le nom commercial ne concerne que les profils entreprise.",
      );
    }

    const changedFields: string[] = [];
    if (data.adresse !== undefined && data.adresse.trim() !== taxpayer.address) {
      taxpayer.address = data.adresse.trim();
      changedFields.push("Adresse");
    }
    if (data.ville !== undefined && data.ville.trim() !== taxpayer.city) {
      taxpayer.city = data.ville.trim();
      changedFields.push("Ville");
    }
    if (data.telephone !== undefined && data.telephone.trim() !== taxpayer.phone) {
      taxpayer.phone = data.telephone.trim();
      changedFields.push("Téléphone");
    }
    if (data.nomCommercial !== undefined) {
      const nextTrade = data.nomCommercial.trim() || null;
      if (nextTrade !== (taxpayer.tradeName ?? null)) {
        taxpayer.tradeName = nextTrade;
        changedFields.push("Nom commercial");
      }
    }

    const saved = await this.taxpayers.save(taxpayer);

    if (changedFields.length > 0) {
      const displayName =
        saved.legalName?.trim() ||
        [saved.lastName, saved.firstName].filter(Boolean).join(" ").trim() ||
        user.name;
      const fingerprint = createHash("sha256")
        .update(
          `${saved.address}|${saved.city}|${saved.phone}|${saved.tradeName ?? ""}`,
        )
        .digest("hex")
        .slice(0, 16);
      const summaryRows = [
        { label: "Contribuable", value: displayName },
        ...(saved.nif ? [{ label: "NIF", value: saved.nif }] : []),
        { label: "Champs modifiés", value: changedFields.join(", ") },
        { label: "Adresse", value: saved.address },
        { label: "Ville", value: saved.city },
        { label: "Téléphone", value: saved.phone },
      ];

      if (this.adminNotifications) {
        await this.adminNotifications.notifyClientProfileUpdated({
          userId: user.id,
          taxpayerId: saved.id,
          name: displayName,
          email: saved.email || user.email,
          taxpayerType: saved.type,
          nif: saved.nif,
          actionLabel: "Mise à jour des coordonnées contribuables",
          summaryRows,
          idempotencyToken: `UPD_${fingerprint}`,
        });
      }

      if (this.acknowledgments) {
        await this.acknowledgments.sendProfileUpdateAcknowledgment({
          userId: user.id,
          taxpayerId: saved.id,
          recipientName: displayName,
          recipientEmail: saved.email || user.email,
          nif: saved.nif,
          actionLabel: "Mise à jour de vos coordonnées contribuables",
          summaryRows,
          idempotencyToken: `UPD_${fingerprint}`,
        });
      }
    }

    return this.toTaxpayerView(saved);
  }

  async list(search = "", page = 1, perPage = 25) {
    const pageNumber = Math.max(1, Math.floor(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(perPage) || 25));
    const term = search.trim();
    const request = this.taxpayers
      .createQueryBuilder("taxpayer")
      .leftJoinAndSelect("taxpayer.user", "user")
      .where("taxpayer.region = :region", { region: SRE_REGION })
      .orderBy("taxpayer.createdAt", "DESC");
    if (term) {
      request.andWhere(
        "taxpayer.lastName ILIKE :term OR taxpayer.firstName ILIKE :term OR taxpayer.legalName ILIKE :term OR taxpayer.nif ILIKE :term OR taxpayer.email ILIKE :term",
        { term: `%${term}%` },
      );
    }
    const [rows, total] = await request
      .skip((pageNumber - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      donnees: rows.map((taxpayer) => this.toTaxpayerView(taxpayer)),
      total,
      page: pageNumber,
      parPage: pageSize,
    };
  }

  async getOne(id: string) {
    const taxpayer = await this.taxpayers.findOne({
      where: { id, region: SRE_REGION },
      relations: { user: true },
    });
    if (!taxpayer)
      throw new NotFoundException(
        "Contribuable introuvable dans le périmètre Haute Matsiatra.",
      );
    return this.toTaxpayerView(taxpayer);
  }

  async createForAdministration(data: CreateTaxpayerDto) {
    const email = data.courriel.trim().toLowerCase();
    const nif = data.nif?.trim().toUpperCase() || null;
    const stat = data.stat?.trim().toUpperCase() || null;
    if (
      (await this.users.exist({ where: { email } })) ||
      (await this.taxpayers.exist({
        where: [
          { email },
          ...(nif ? [{ nif }] : []),
          ...(stat ? [{ stat }] : []),
        ],
      }))
    ) {
      throw new ConflictException(
        "Un profil utilise déjà cette adresse e-mail, ce NIF ou ce STAT.",
      );
    }
    const profile = this.taxpayers.create({
      user: null,
      type: data.type,
      lastName: data.nom.trim(),
      firstName: data.prenom?.trim() || null,
      legalName: data.raisonSociale?.trim() || null,
      tradeName: data.nomCommercial?.trim() || null,
      nif,
      stat,
      address: data.adresse.trim(),
      region: SRE_REGION,
      city: data.ville.trim(),
      email,
      phone: data.telephone.trim(),
      legalRepresentative: data.representantLegal?.trim() || null,
      contactLastName: data.nomContact?.trim() || null,
      contactFirstName: data.prenomContact?.trim() || null,
      contactRole: data.fonctionContact?.trim() || null,
      accountCreatedAt: new Date(),
    });
    return this.toTaxpayerView(await this.taxpayers.save(profile));
  }

  /** Excel import (data read and pre-validated client-side, validated then stored here). */
  async importTaxpayers(profiles: CreateTaxpayerDto[]) {
    if (!profiles.length)
      throw new BadRequestException(
        "Aucun profil à importer n'a été transmis.",
      );

    // Hashing of provisional passwords in parallel BEFORE the transaction.
    const rounds = Number(this.configuration.get<string>("BCRYPT_ROUNDS", "12"));
    const rowTypes = profiles.map((data) => {
      const email = data.courriel?.trim().toLowerCase() ?? "";
      const stat = data.stat?.trim().toUpperCase() || null;
      const isBusinessWithAccount =
        data.type === TaxpayerType.BUSINESS &&
        Boolean(stat) &&
        isValidEmail(email) &&
        Boolean(data.raisonSociale?.trim());
      return { email, stat, isBusinessWithAccount };
    });
    const hashes = await Promise.all(
      rowTypes.map((entry) =>
        entry.isBusinessWithAccount && entry.stat
          ? bcrypt.hash(entry.stat, rounds)
          : Promise.resolve(null),
      ),
    );

    const result = await this.dataSource.transaction(
      async (manager) => {
        const taxpayersRepository = manager.getRepository(TaxpayerEntity);
        const usersRepository = manager.getRepository(UserEntity);
        const existing = await taxpayersRepository.find({
          select: { email: true, nif: true, stat: true },
        });
        const accounts = await usersRepository.find({
          select: { email: true },
        });
        const emails = new Set([
          ...existing.map((entry) => entry.email.toLowerCase()),
          ...accounts.map((entry) => entry.email.toLowerCase()),
        ]);
        const nifs = new Set(
          existing
            .map((entry) => entry.nif?.toUpperCase())
            .filter((value): value is string => Boolean(value)),
        );
        const stats = new Set(
          existing
            .map((entry) => entry.stat?.toUpperCase())
            .filter((value): value is string => Boolean(value)),
        );

        const report: ImportRowResult[] = [];
        const newProfiles: TaxpayerEntity[] = [];
        const accountsCreated: {
          user: UserEntity;
          label: string;
          stat: string;
        }[] = [];
        let ignored = 0;
        let duplicates = 0;
        let rejected = 0;
        let accountsCreatedCount = 0;

        for (const [index, data] of profiles.entries()) {
          const row = index + 1;
          const entry = rowTypes[index];
          const email = entry.email;
          const stat = entry.stat;
          const nif = data.nif?.trim().toUpperCase() || null;
          const label =
            data.raisonSociale?.trim() || data.nom?.trim() || email;
          const errors: string[] = [];

          // 1. Presence and validity of the required information.
          if (!isValidEmail(email))
            errors.push("Adresse e-mail absente ou invalide.");
          if (data.type === TaxpayerType.BUSINESS) {
            if (!data.raisonSociale?.trim())
              errors.push("Raison sociale manquante.");
            if (!stat) errors.push("Numéro STAT manquant.");
          }
          if (errors.length) {
            rejected += 1;
            report.push({ ligne: row, libelle: label, statut: "REJETE", erreurs: errors });
            continue;
          }

          // 2. Duplicates (e-mail, NIF, STAT already registered).
          if (emails.has(email)) {
            duplicates += 1;
            ignored += 1;
            report.push({
              ligne: row,
              libelle: label,
              statut: "DOUBLON",
              motif: "Adresse e-mail déjà enregistrée (profil ou compte existant).",
            });
            continue;
          }
          if (nif && nifs.has(nif)) {
            duplicates += 1;
            ignored += 1;
            report.push({
              ligne: row,
              libelle: label,
              statut: "DOUBLON",
              motif: "NIF déjà enregistré.",
            });
            continue;
          }
          if (stat && stats.has(stat)) {
            duplicates += 1;
            ignored += 1;
            report.push({
              ligne: row,
              libelle: label,
              statut: "DOUBLON",
              motif: "Numéro STAT déjà enregistré.",
            });
            continue;
          }

          // 3. Profile creation, then account creation for valid businesses.
          const profile = taxpayersRepository.create({
            user: null,
            type: data.type,
            lastName: data.nom.trim(),
            firstName: data.prenom?.trim() || null,
            legalName: data.raisonSociale?.trim() || null,
            tradeName: data.nomCommercial?.trim() || null,
            nif,
            stat,
            address: data.adresse.trim(),
            region: SRE_REGION,
            city: data.ville.trim(),
            email,
            phone: data.telephone.trim(),
            legalRepresentative: data.representantLegal?.trim() || null,
            contactLastName: data.nomContact?.trim() || null,
            contactFirstName: data.prenomContact?.trim() || null,
            contactRole: data.fonctionContact?.trim() || null,
            accountCreatedAt: new Date(),
          });
          const savedProfile = await taxpayersRepository.save(profile);
          newProfiles.push(savedProfile);
          emails.add(email);
          if (nif) nifs.add(nif);
          if (stat) stats.add(stat);

          if (entry.isBusinessWithAccount && stat && hashes[index]) {
            // Distinct account.
            const user = await usersRepository.save(
              usersRepository.create({
                name: label.slice(0, 160),
                email,
                passwordHash: hashes[index] as string,
                role: AccountRole.CLIENT,
                status: AccountStatus.ACTIVE,
                mustChangePassword: true,
                isProfileComplete: false,
              }),
            );
            savedProfile.user = user;
            await taxpayersRepository.save(savedProfile);
            accountsCreatedCount += 1;
            accountsCreated.push({ user, label, stat });
            report.push({
              ligne: row,
              libelle: label,
              statut: "COMPTE_CREE",
              profilId: savedProfile.id,
              compteId: user.id,
            });
          } else {
            report.push({
              ligne: row,
              libelle: label,
              statut: "PROFIL_CREE",
              profilId: savedProfile.id,
            });
          }
        }

        return {
          rapport: report,
          donnees: newProfiles.map((taxpayer) =>
            this.toTaxpayerView(taxpayer),
          ),
          creees: newProfiles.length,
          ignorees: ignored,
          comptesCrees: accountsCreatedCount,
          doublons: duplicates,
          rejetees: rejected,
          comptes: accountsCreated.map((entry) => ({
            utilisateur: entry.user,
            libelle: entry.label,
            stat: entry.stat,
          })),
        };
      },
    );

    // 4. First-sign-in e-mails, outside the transaction.
    const emails = [];
    for (const entry of result.comptes) {
      try {
        const request = await this.activation.createActivationRequest(
          entry.utilisateur,
          entry.libelle,
          entry.stat,
        );
        emails.push({
          compteId: entry.utilisateur.id,
          destinataire: request.destinataire,
          statutCourriel: request.statutCourriel,
          demandeId: request.id,
        });
      } catch {
        emails.push({
          compteId: entry.utilisateur.id,
          destinataire: entry.utilisateur.email,
          statutCourriel: ActivationEmailStatus.FAILED,
          demandeId: null,
        });
      }
    }
    for (const entry of result.rapport) {
      if (entry.statut === "COMPTE_CREE") {
        const email = emails.find((e) => e.compteId === entry.compteId);
        if (email) entry.statutCourriel = email.statutCourriel;
      }
    }

    return {
      donnees: result.donnees,
      creees: result.creees,
      ignorees: result.ignorees,
      rapport: result.rapport,
      comptesCrees: result.comptesCrees,
      doublons: result.doublons,
      rejetees: result.rejetees,
      emails,
    };
  }

  async remove(id: string) {
    return this.dataSource.transaction(async (manager) => {
      const taxpayersRepository = manager.getRepository(TaxpayerEntity);
      // PostgreSQL forbids FOR UPDATE on the nullable side of a join outer join: lock the taxpayer row alone first, then.
      const lock = await taxpayersRepository.findOne({
        where: { id, region: SRE_REGION },
        lock: { mode: "pessimistic_write" },
      });
      if (!lock) throw new NotFoundException("Contribuable introuvable.");
      const taxpayer = await taxpayersRepository.findOne({
        where: { id, region: SRE_REGION },
        relations: { user: true },
      });
      if (!taxpayer)
        throw new NotFoundException("Contribuable introuvable.");
      if (taxpayer.user) {
        throw new ConflictException(
          "Ce profil est associé à un compte utilisateur. Désactivez le compte plutôt que de supprimer son dossier.",
        );
      }
      const [hasObligations, hasPayments] = await Promise.all([
        manager
          .getRepository(ObligationEntity)
          .exist({ where: { taxpayer: { id } } }),
        manager
          .getRepository(PaymentEntity)
          .exist({ where: { taxpayer: { id } } }),
      ]);
      if (hasObligations || hasPayments) {
        throw new ConflictException(
          "Ce profil possède un historique fiscal ou de paiement et ne peut pas être supprimé.",
        );
      }
      await taxpayersRepository.remove(taxpayer);
      return { message: "Le profil contribuable a été supprimé." };
    });
  }

  private toTaxpayerView(taxpayer: TaxpayerEntity) {
    return {
      id: taxpayer.id,
      utilisateurId: taxpayer.user?.id,
      type: taxpayer.type,
      nom: taxpayer.lastName,
      prenom: taxpayer.firstName,
      raisonSociale: taxpayer.legalName,
      nomCommercial: taxpayer.tradeName,
      nif: taxpayer.nif,
      stat: taxpayer.stat,
      adresse: taxpayer.address,
      region: taxpayer.region,
      ville: taxpayer.city,
      courriel: taxpayer.email,
      telephone: taxpayer.phone,
      representantLegal: taxpayer.legalRepresentative,
      nomContact: taxpayer.contactLastName,
      prenomContact: taxpayer.contactFirstName,
      fonctionContact: taxpayer.contactRole,
      dateCreationCompte: taxpayer.accountCreatedAt,
      creeLe: taxpayer.createdAt,
      statutCompte: taxpayer.user?.status ?? null,
    };
  }
}
