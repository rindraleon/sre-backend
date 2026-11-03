import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, EntityManager, Repository } from "typeorm";
import { PaymentEventEntity } from "../database/entities/payment-event.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { UserEntity } from "../database/entities/user.entity";
import { SRE_REGION } from "../database/region";
import {
  PaymentMethod,
  AccountRole,
  ObligationStatus,
  PaymentDocumentType,
  PaymentOrigin,
  PaymentStatus,
} from "../database/enums";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";
import { PaymentProviderCallbackDto } from "./dto/payment-provider-callback.dto";
import {
  applyPaymentFilters,
  applyPaymentSort,
  PaymentFilters,
} from "./payment-filters";
import {
  assertAmount,
  assertTransactionDate,
  buildInternalReference,
  isTaxTypeApplicable,
  resolveFiscalPeriod,
} from "./payment-rules";
import { PaymentProviderGuard } from "./payment-provider.guard";
import { DocumentsService } from "../documents/documents.service";
import { normalizeDocumentIssuer } from "../documents/document-issuer";
import { AcknowledgmentService } from "../notifications/acknowledgment.service";
import { type OutgoingEmailAttachment } from "../notifications/mail.service";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

const OPEN_STATUSES = [PaymentStatus.PENDING, PaymentStatus.UNDER_REVIEW];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    @InjectRepository(TaxTypeEntity)
    private readonly taxTypes: Repository<TaxTypeEntity>,
    private readonly dataSource: DataSource,
    private readonly documents: DocumentsService,
    private readonly configuration: ConfigService,
    @Optional()
    private readonly acknowledgments?: AcknowledgmentService,
  ) {}

  // ---------------------------------------------------------------------------
  // Déclaration de paiement (autonome ou rattachée à une obligation)
  // ---------------------------------------------------------------------------

  async createDeclaration(user: AuthenticatedUser, data: CreatePaymentDto) {
    if (!["ADMIN", "CLIENT"].includes(user.role)) {
      throw new ForbiddenException("Rôle non autorisé à déclarer un paiement.");
    }

    const taxpayerId = await this.resolveTaxpayerId(user, data.contribuableId);
    const idempotencyKey = data.cleIdempotence?.trim() || null;

    if (idempotencyKey) {
      const existing = await this.payments.findOne({
        where: { idempotencyKey },
        relations: {
          taxpayer: true,
          obligation: { taxType: true },
          taxType: true,
        },
      });
      if (existing) {
        if (existing.taxpayer?.id !== taxpayerId) {
          throw new ConflictException(
            "Cette clé d'idempotence est déjà utilisée pour un autre contribuable.",
          );
        }
        // Soumission répétée : on renvoie la déclaration déjà enregistrée.
        return this.getOne(existing.id, user);
      }
    }

    const transactionDate = assertTransactionDate(data.dateTransaction);
    const duplicate = await this.payments
      .createQueryBuilder("payment")
      .where("payment.mode = :mode", { mode: data.mode })
      .andWhere("payment.transactionReference = :reference", {
        reference: data.referenceTransaction.trim(),
      })
      .andWhere("payment.status NOT IN (:...exclus)", {
        exclus: [
          PaymentStatus.CANCELLED,
          PaymentStatus.REJECTED,
          PaymentStatus.FAILED,
        ],
      })
      .getOne();
    if (duplicate) {
      throw new ConflictException(
        "Cette référence d'opération est déjà enregistrée pour un paiement en cours ou confirmé.",
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const taxpayer = await manager.getRepository(TaxpayerEntity).findOne({
        where: { id: taxpayerId },
        select: { id: true, nif: true },
      });
      if (!taxpayer?.nif?.trim()) {
        throw new BadRequestException(
          "Un NIF valide est requis dans le profil contribuable avant de déclarer un paiement.",
        );
      }

      const obligation = data.obligationId
        ? await this.loadObligation(manager, data.obligationId, taxpayerId)
        : null;

      const taxType = obligation
        ? obligation.taxType
        : await this.loadTaxType(manager, data.typeImpotId, taxpayerId);

      if (!taxType || !isTaxTypeApplicable(taxType, await this.taxpayerType(manager, taxpayerId))) {
        throw new BadRequestException(
          "Cette nature d'impôt n'est pas ouverte à ce contribuable.",
        );
      }

      if (
        data.mode === PaymentMethod.MOBILE_MONEY &&
        (!data.operateur || !data.telephoneUtilise)
      ) {
        throw new BadRequestException(
          "L'opérateur et le numéro sont requis pour une déclaration mobile-money.",
        );
      }
      if (
        data.mode === PaymentMethod.BANK_TRANSFER &&
        !data.banqueOuCanal?.trim()
      ) {
        throw new BadRequestException(
          "Le canal est requis pour une déclaration de virement.",
        );
      }

      const amount = obligation
        ? Number(obligation.amount)
        : assertAmount(Number(data.montant), taxType);

      if (obligation) {
        const eligibleStatuses = [
          ObligationStatus.TO_PAY,
          ObligationStatus.OVERDUE,
          ObligationStatus.REJECTED,
          ObligationStatus.CORRECTION_REQUESTED,
        ];
        if (!eligibleStatuses.includes(obligation.status)) {
          throw new ConflictException(
            "Cette obligation possède déjà une déclaration en cours ou est réglée.",
          );
        }
      }

      const fiscalPeriod = obligation
        ? { period: obligation.period, start: null, end: null }
        : resolveFiscalPeriod(
            taxType.periodicity,
            data.periode,
            transactionDate,
          );

      // Validation automatique : les contrôles ci-dessus étant satisfaits, la
      // déclaration est validée immédiatement, sans confirmation de paiement ni
      // intervention d'un administrateur.
      const validatedAt = new Date();
      const paymentsRepository = manager.getRepository(PaymentEntity);
      const payment = paymentsRepository.create({
        internalReference: buildInternalReference(randomUUID()),
        taxpayer:
          obligation?.taxpayer ??
          manager.getRepository(TaxpayerEntity).create({ id: taxpayerId }),
        obligation,
        taxType,
        fiscalPeriod: fiscalPeriod.period,
        periodStart: fiscalPeriod.start,
        periodEnd: fiscalPeriod.end,
        amount: String(amount),
        currency: "MGA",
        mode: data.mode,
        operator:
          data.mode === PaymentMethod.MOBILE_MONEY
            ? (data.operateur ?? null)
            : null,
        usedPhone:
          data.mode === PaymentMethod.MOBILE_MONEY
            ? (data.telephoneUtilise?.trim() ?? null)
            : null,
        bankOrChannel:
          data.mode === PaymentMethod.BANK_TRANSFER
            ? (data.banqueOuCanal?.trim() ?? null)
            : null,
        payerName: data.titulairePayeur?.trim() || null,
        transactionReference: data.referenceTransaction.trim(),
        transactionDate,
        supportingDocumentName: this.sanitizeSupportingDocumentName(
          data.justificatifNom,
        ),
        origin: obligation ? PaymentOrigin.OBLIGATION : PaymentOrigin.AUTONOMOUS,
        idempotencyKey,
        status: PaymentStatus.CONFIRMED,
        provider: "validation-automatique",
        providerReference: null,
        confirmedAt: validatedAt,
        validatedAt,
        validatedBy: null,
        decisionReason: null,
        failureReason: null,
      });
      const saved = await paymentsRepository.save(payment);

      if (obligation) {
        obligation.status = ObligationStatus.PAID;
        await manager.getRepository(ObligationEntity).save(obligation);
      }

      // Le reçu officiel est émis immédiatement après la validation : il remplace
      // l'ancien accusé de soumission comme document de confirmation remis au demandeur.
      const receipt = await this.documents.ensureReceipt(manager, saved);

      await manager.getRepository(PaymentEventEntity).save(
        manager.getRepository(PaymentEventEntity).create({
          payment: saved,
          status: PaymentStatus.CONFIRMED,
          label: obligation
            ? "Déclaration validée automatiquement — reçu officiel émis"
            : "Déclaration autonome validée automatiquement — reçu officiel émis",
          actor: null,
          actorName: "Système — validation automatique",
          reason: null,
          createdAt: validatedAt,
        }),
      );

      return {
        paymentId: saved.id,
        receiptId: receipt?.id ?? null,
        receiptNumber: receipt?.number ?? null,
      };
    });

    void this.notifyReceipt(created.paymentId, user);
    return this.getOne(created.paymentId, user);
  }

  // ---------------------------------------------------------------------------
  // Confirmation : déclenche la génération automatique du reçu
  // ---------------------------------------------------------------------------

  /**
   * Confirme un paiement et génère le reçu dans la même transaction.
   * Idempotent : une seconde confirmation ne crée ni événement ni reçu supplémentaire.
   *
   * Appelé par :
   *  - le callback signé du mécanisme de paiement (`POST /paiements/confirmations`) ;
   *  - la décision administrative de rapprochement (`PATCH /paiements/:id/decision`),
   *    utilisée lorsque aucun prestataire n'est connecté.
   */
  async confirmPayment(
    paymentId: string,
    options: {
      provider: string;
      providerReference?: string | null;
      actor?: { id: string; name: string } | null;
      label?: string;
      reason?: string | null;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentEntity)
        .createQueryBuilder("payment")
        .setLock("pessimistic_write", undefined, ["payment"])
        .leftJoinAndSelect("payment.taxpayer", "taxpayer")
        .leftJoinAndSelect("payment.taxType", "taxType")
        .leftJoinAndSelect("payment.obligation", "obligation")
        .where("payment.id = :id", { id: paymentId })
        .getOne();

      if (!payment) throw new NotFoundException("Paiement introuvable.");

      if (payment.status === PaymentStatus.CONFIRMED) {
        // Déjà confirmé : on garantit simplement la présence du reçu.
        const receipt = await this.documents.ensureReceipt(manager, payment);
        return { payment, receipt, alreadyConfirmed: true };
      }
      if (
        [PaymentStatus.CANCELLED, PaymentStatus.REJECTED, PaymentStatus.FAILED].includes(
          payment.status,
        )
      ) {
        throw new ConflictException(
          "Ce paiement est clôturé (annulé, rejeté ou en échec) : il ne peut plus être confirmé.",
        );
      }

      const confirmedAt = new Date();
      payment.status = PaymentStatus.CONFIRMED;
      payment.confirmedAt = confirmedAt;
      payment.validatedAt = confirmedAt;
      payment.provider = options.provider;
      payment.providerReference = options.providerReference ?? null;
      payment.failureReason = null;
      payment.validatedBy = options.actor
        ? manager.getRepository(UserEntity).create({ id: options.actor.id })
        : null;
      await manager.getRepository(PaymentEntity).save(payment);

      if (payment.obligation) {
        payment.obligation.status = ObligationStatus.PAID;
        await manager.getRepository(ObligationEntity).save(payment.obligation);
      }

      await manager.getRepository(PaymentEventEntity).save(
        manager.getRepository(PaymentEventEntity).create({
          payment,
          status: PaymentStatus.CONFIRMED,
          label:
            options.label ??
            `Paiement confirmé (${options.provider}) — reçu généré automatiquement`,
          actor: payment.validatedBy,
          actorName: options.actor?.name ?? "Système",
          reason: options.reason ?? null,
          createdAt: confirmedAt,
        }),
      );

      // Le reçu est émis ici, dans la transaction de confirmation : jamais avant.
      const receipt = await this.documents.ensureReceipt(manager, payment);
      return { payment, receipt, alreadyConfirmed: false };
    });
  }

  /** Callback du mécanisme de paiement : signature HMAC vérifiée par le garde. */
  async handleProviderCallback(data: PaymentProviderCallbackDto) {
    const payment = await this.payments.findOne({
      where: [
        { internalReference: data.referenceInterne ?? "" },
        { transactionReference: data.referenceTransaction ?? "" },
      ],
      relations: { taxpayer: true, taxType: true, obligation: true },
    });
    if (!payment) {
      throw new NotFoundException(
        "Aucun paiement ne correspond à cette référence.",
      );
    }

    const fournisseurParDefaut = this.configuration.get<string>(
      "PAYMENT_PROVIDER",
      "prestataire",
    );

    if (data.statut === "CONFIRME") {
      const result = await this.confirmPayment(payment.id, {
        provider: data.fournisseur ?? fournisseurParDefaut,
        providerReference: data.referenceFournisseur ?? null,
        actor: null,
        label: `Confirmation reçue du mécanisme de paiement (${data.fournisseur ?? fournisseurParDefaut})`,
        reason: data.motif ?? null,
      });
      void this.notifyConfirmation(result.payment.id);
      return {
        referenceInterne: result.payment.internalReference,
        statut: result.payment.status,
        recu: result.receipt?.number ?? null,
        dejaConfirme: result.alreadyConfirmed,
      };
    }

    if (data.statut === "ECHEC") {
      return this.markFailed(payment.id, {
        reason: data.motif?.trim() || "Échec signalé par le mécanisme de paiement.",
        provider: data.fournisseur ?? fournisseurParDefaut,
        providerReference: data.referenceFournisseur ?? null,
      });
    }

    throw new BadRequestException(
      "Statut de callback inconnu : seuls CONFIRME et ECHEC sont acceptés.",
    );
  }

  /** Échec signalé : aucun reçu n'est produit. */
  async markFailed(
    paymentId: string,
    options: { reason: string; provider: string; providerReference?: string | null },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentEntity)
        .createQueryBuilder("payment")
        .setLock("pessimistic_write", undefined, ["payment"])
        .where("payment.id = :id", { id: paymentId })
        .getOne();
      if (!payment) throw new NotFoundException("Paiement introuvable.");
      if (payment.status === PaymentStatus.CONFIRMED) {
        throw new ConflictException(
          "Un paiement confirmé ne peut pas être marqué en échec.",
        );
      }
      if (payment.status === PaymentStatus.FAILED) {
        return { referenceInterne: payment.internalReference, statut: payment.status, recu: null };
      }

      payment.status = PaymentStatus.FAILED;
      payment.failureReason = options.reason;
      payment.provider = options.provider;
      payment.providerReference = options.providerReference ?? null;
      await manager.getRepository(PaymentEntity).save(payment);

      if (payment.obligation) {
        payment.obligation.status = ObligationStatus.REJECTED;
        await manager.getRepository(ObligationEntity).save(payment.obligation);
      }

      await manager.getRepository(PaymentEventEntity).save(
        manager.getRepository(PaymentEventEntity).create({
          payment,
          status: PaymentStatus.FAILED,
          label: "Paiement en échec — aucun reçu émis",
          actor: null,
          actorName: "Système",
          reason: options.reason,
        }),
      );
      return {
        referenceInterne: payment.internalReference,
        statut: payment.status,
        recu: null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Annulation par le contribuable
  // ---------------------------------------------------------------------------

  async cancel(id: string, user: AuthenticatedUser) {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager
        .getRepository(PaymentEntity)
        .createQueryBuilder("payment")
        .setLock("pessimistic_write", undefined, ["payment"])
        .leftJoinAndSelect("payment.taxpayer", "taxpayer")
        .where("payment.id = :id", { id })
        .getOne();
      if (!payment) throw new NotFoundException("Paiement introuvable.");
      if (
        user.role !== AccountRole.ADMIN &&
        payment.taxpayer?.id !== user.taxpayerId
      ) {
        throw new ForbiddenException("Ce paiement ne vous appartient pas.");
      }
      if (!OPEN_STATUSES.includes(payment.status)) {
        throw new ConflictException(
          "Seul un paiement en attente de confirmation peut être annulé.",
        );
      }
      payment.status = PaymentStatus.CANCELLED;
      payment.cancelledAt = new Date();
      await manager.getRepository(PaymentEntity).save(payment);
      if (payment.obligation) {
        payment.obligation.status = ObligationStatus.TO_PAY;
        await manager.getRepository(ObligationEntity).save(payment.obligation);
      }
      await manager.getRepository(PaymentEventEntity).save(
        manager.getRepository(PaymentEventEntity).create({
          payment,
          status: PaymentStatus.CANCELLED,
          label: "Paiement annulé — aucun reçu émis",
          actor: manager.getRepository(UserEntity).create({ id: user.id }),
          actorName: user.name,
          reason: "Annulation demandée par l'utilisateur.",
        }),
      );

      // Relecture dans la transaction : la ligne n'est pas encore visible ailleurs.
      const updated = await manager.getRepository(PaymentEntity).findOneOrFail({
        where: { id },
        relations: {
          taxpayer: true,
          obligation: true,
          taxType: true,
          history: true,
          documents: true,
        },
      });
      return this.toPaymentView(updated);
    });
  }

  // ---------------------------------------------------------------------------
  // Décision administrative (rapprochement / rejet / correction)
  // ---------------------------------------------------------------------------

  async decide(id: string, user: AuthenticatedUser, data: PaymentDecisionDto) {
    if (user.role !== AccountRole.ADMIN) {
      throw new ForbiddenException("Décision réservée à l'administration.");
    }
    if (
      ![
        PaymentStatus.CONFIRMED,
        PaymentStatus.REJECTED,
        PaymentStatus.CORRECTION_REQUESTED,
      ].includes(data.statut)
    ) {
      throw new BadRequestException("Statut de décision invalide.");
    }
    if (
      data.statut !== PaymentStatus.CONFIRMED &&
      (!data.motif || data.motif.trim().length < 5)
    ) {
      throw new BadRequestException(
        "Un motif d'au moins 5 caractères est requis pour cette décision.",
      );
    }

    if (data.statut === PaymentStatus.CONFIRMED) {
      // La confirmation déclenche la génération automatique du reçu.
      const result = await this.confirmPayment(id, {
        provider: "rapprochement-administratif",
        providerReference: data.referenceFournisseur ?? null,
        actor: { id: user.id, name: user.name },
        label:
          "Paiement confirmé par rapprochement administratif — reçu généré automatiquement",
        reason: data.motif?.trim() || null,
      });
      void this.notifyConfirmation(result.payment.id);
      return this.getOne(id, user);
    }

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PaymentEntity);
      const payment = await repository
        .createQueryBuilder("payment")
        .setLock("pessimistic_write", undefined, ["payment"])
        .leftJoinAndSelect("payment.obligation", "obligation")
        .where("payment.id = :id", { id })
        .getOne();
      if (!payment) throw new NotFoundException("Déclaration introuvable.");
      if (payment.status === PaymentStatus.CONFIRMED) {
        throw new ConflictException(
          "Un paiement confirmé ne peut plus recevoir de décision de rejet.",
        );
      }
      const reason = data.motif?.trim() || null;
      payment.status = data.statut;
      payment.validatedAt = new Date();
      payment.validatedBy = manager.getRepository(UserEntity).create({ id: user.id });
      payment.decisionReason = reason;
      await repository.save(payment);

      if (payment.obligation) {
        payment.obligation.status =
          data.statut === PaymentStatus.REJECTED
            ? ObligationStatus.REJECTED
            : ObligationStatus.CORRECTION_REQUESTED;
        await manager.getRepository(ObligationEntity).save(payment.obligation);
      }

      await manager.getRepository(PaymentEventEntity).save(
        manager.getRepository(PaymentEventEntity).create({
          payment,
          status: data.statut,
          label:
            data.statut === PaymentStatus.REJECTED
              ? "Déclaration rejetée — aucun reçu émis"
              : "Correction demandée — aucun reçu émis",
          actor: payment.validatedBy,
          actorName: user.name,
          reason,
        }),
      );
    });

    void this.notifyDecision(id);
    return this.getOne(id, user);
  }

  // ---------------------------------------------------------------------------
  // Lecture
  // ---------------------------------------------------------------------------

  async listMyPayments(user: AuthenticatedUser) {
    if (!user.taxpayerId) return [];
    const rows = await this.buildQuery()
      .where("payment.taxpayer = :taxpayerId", { taxpayerId: user.taxpayerId })
      .andWhere("taxpayer.region = :region", { region: SRE_REGION })
      .orderBy("payment.submittedAt", "DESC")
      .getMany();
    return rows.map((payment) => this.toPaymentView(payment));
  }

  async listForAdministration(filters: PaymentFilters) {
    const request = this.buildQuery();
    applyPaymentFilters(request, filters);
    applyPaymentSort(request, filters.sort);
    const page = filters.page ?? 1;
    const perPage = filters.perPage ?? 25;
    const [rows, total] = await request
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();
    return {
      donnees: rows.map((payment) => this.toPaymentView(payment)),
      total,
      page,
      parPage: perPage,
      pages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getOne(id: string, user: AuthenticatedUser) {
    const request = this.buildQuery()
      .where("payment.id = :paymentId", { paymentId: id })
      .andWhere("taxpayer.region = :region", { region: SRE_REGION });
    if (user.role !== AccountRole.ADMIN) {
      if (!user.taxpayerId) throw new NotFoundException("Paiement introuvable.");
      request.andWhere("payment.taxpayer = :taxpayerId", {
        taxpayerId: user.taxpayerId,
      });
    }
    const payment = await request.getOne();
    if (!payment) throw new NotFoundException("Paiement introuvable.");
    return this.toPaymentView(payment);
  }

  /** Budget de requête partagé par les listes et les exports. */
  buildQuery() {
    return this.payments
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.taxpayer", "taxpayer")
      .leftJoinAndSelect("payment.obligation", "obligation")
      .leftJoinAndSelect("payment.taxType", "taxType")
      .leftJoinAndSelect("payment.history", "history")
      .leftJoinAndSelect("payment.documents", "documents");
  }

  toPaymentView(payment: PaymentEntity) {
    const taxTypeName =
      payment.taxType?.name ??
      payment.obligation?.taxType?.name ??
      "Nature d'impôt non précisée";
    const period =
      payment.fiscalPeriod ?? payment.obligation?.period ?? null;
    const receipt = [...(payment.documents ?? [])]
      .filter((document) => document.type === "RECU_PAIEMENT")
      .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())[0];

    return {
      id: payment.id,
      referenceInterne: payment.internalReference,
      contribuableId: payment.taxpayer?.id,
      contribuable: payment.taxpayer
        ? {
            id: payment.taxpayer.id,
            nom: payment.taxpayer.lastName,
            prenom: payment.taxpayer.firstName,
            raisonSociale: payment.taxpayer.legalName,
            nif: payment.taxpayer.nif,
            stat: payment.taxpayer.stat,
            type: payment.taxpayer.type,
            courriel: payment.taxpayer.email,
          }
        : undefined,
      obligationId: payment.obligation?.id ?? null,
      origine: payment.origin,
      typeImpotId: payment.taxType?.id ?? payment.obligation?.taxType?.id,
      typeImpotNom: taxTypeName,
      referenceFiscale: payment.obligation?.taxReference ?? null,
      periode: period,
      debutPeriode: payment.periodStart,
      finPeriode: payment.periodEnd,
      montant: Number(payment.amount),
      devise: payment.currency,
      mode: payment.mode,
      operateur: payment.operator,
      telephoneUtilise: payment.usedPhone,
      banqueOuCanal: payment.bankOrChannel,
      titulairePayeur: payment.payerName,
      referenceTransaction: payment.transactionReference,
      dateTransaction: payment.transactionDate,
      justificatifNom: payment.supportingDocumentName,
      statut: payment.status,
      soumisLe: payment.submittedAt,
      confirmeLe: payment.confirmedAt,
      valideLe: payment.validatedAt,
      validePar: payment.validatedBy?.name,
      motifRejet: payment.decisionReason,
      motifEchec: payment.failureReason,
      fournisseur: payment.provider,
      referenceFournisseur: payment.providerReference,
      recu: receipt
        ? {
            id: receipt.id,
            numero: receipt.number,
            emisLe: receipt.issuedAt,
            codeVerification: receipt.verificationCode,
            lienPdf: `/documents/${receipt.id}/pdf`,
          }
        : null,
      historique: [...(payment.history ?? [])]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((event) => ({
          statut: event.status,
          libelle: event.label,
          date: event.createdAt,
          acteur: event.actorName,
          motif: event.reason,
        })),
      documents: [...(payment.documents ?? [])]
        .filter((document) => document.status === "VALIDE")
        .sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime())
        .map((document) => ({
          id: document.id,
          numero: document.number,
          type: document.type,
          emisLe: document.issuedAt,
          montant: Number(document.amount),
          devise: document.currency,
          statut: document.status,
          contribuableId: document.taxpayer?.id,
          referencePaiement: payment.internalReference,
          typeImpotNom: taxTypeName,
          periode: period ?? "—",
          referenceTransactionDeclaree: payment.transactionReference,
          modeDeclare: payment.mode,
          codeVerification: document.verificationCode,
          emetteur: normalizeDocumentIssuer(document.issuer),
          mention: document.mention,
          emisPar: document.issuedBy?.name,
          lienPdf: `/documents/${document.id}/pdf`,
        })),
    };
  }

  // ---------------------------------------------------------------------------
  // Interne
  // ---------------------------------------------------------------------------

  private async resolveTaxpayerId(
    user: AuthenticatedUser,
    requestedTaxpayerId?: string,
  ) {
    if (user.role === AccountRole.CLIENT) {
      if (!user.taxpayerId) {
        throw new ForbiddenException(
          "Un compte client lié à un contribuable est nécessaire.",
        );
      }
      if (requestedTaxpayerId && requestedTaxpayerId !== user.taxpayerId) {
        throw new ForbiddenException(
          "Vous ne pouvez déclarer un paiement que pour votre propre compte.",
        );
      }
      return user.taxpayerId;
    }
    if (!requestedTaxpayerId) {
      throw new BadRequestException(
        "Sélectionnez le contribuable concerné par le paiement.",
      );
    }
    return requestedTaxpayerId;
  }

  private async taxpayerType(
    manager: EntityManager,
    taxpayerId: string,
  ): Promise<string> {
    const row = await manager.query<{ type: string; region: string }[]>(
      `SELECT type, region FROM contribuables WHERE id = $1`,
      [taxpayerId],
    );
    const taxpayer = row[0];
    if (!taxpayer) {
      throw new NotFoundException("Contribuable introuvable.");
    }
    if (taxpayer.region !== SRE_REGION) {
      throw new ForbiddenException(
        "Ce contribuable n'appartient pas au périmètre du service.",
      );
    }
    return taxpayer.type;
  }

  private async loadObligation(
    manager: EntityManager,
    obligationId: string,
    taxpayerId: string,
  ) {
    const obligation = await manager
      .getRepository(ObligationEntity)
      .createQueryBuilder("obligation")
      .leftJoinAndSelect("obligation.taxpayer", "taxpayer")
      .leftJoinAndSelect("obligation.taxType", "taxType")
      .where("obligation.id = :obligationId", { obligationId })
      .andWhere("obligation.taxpayer = :taxpayerId", { taxpayerId })
      .setLock("pessimistic_write", undefined, ["obligation"])
      .getOne();
    if (!obligation) {
      throw new NotFoundException("Obligation introuvable pour ce compte.");
    }
    return obligation;
  }

  private async loadTaxType(
    manager: EntityManager,
    taxTypeId: string | undefined,
    taxpayerId: string,
  ) {
    if (!taxTypeId) {
      throw new BadRequestException(
        "Sélectionnez la nature de l'impôt à payer.",
      );
    }
    const taxType = await manager.getRepository(TaxTypeEntity).findOne({
      where: { id: taxTypeId },
    });
    if (!taxType) {
      throw new NotFoundException("Nature d'impôt introuvable.");
    }
    const taxpayer = await manager.query<{ type: string }[]>(
      `SELECT type FROM contribuables WHERE id = $1`,
      [taxpayerId],
    );
    if (!isTaxTypeApplicable(taxType, taxpayer[0]?.type ?? "")) {
      throw new BadRequestException(
        "Cette nature d'impôt n'est pas ouverte à ce type de contribuable.",
      );
    }
    return taxType;
  }

  private sanitizeSupportingDocumentName(name?: string) {
    if (!name) return null;
    const cleaned = name
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .trim();
    return cleaned.slice(0, 200) || null;
  }

  private async notifyReceipt(paymentId: string, user: AuthenticatedUser) {
    if (!this.acknowledgments) return;
    try {
      const payment = await this.payments.findOne({
        where: { id: paymentId },
        relations: {
          taxpayer: true,
          taxType: true,
          obligation: true,
          documents: true,
        },
      });
      if (!payment) return;
      const clientUser = await this.dataSource
        .getRepository(UserEntity)
        .findOne({ where: { taxpayer: { id: payment.taxpayer.id } } });
      if (!clientUser) return;
      const receipt = (payment.documents ?? []).find(
        (document) => document.type === PaymentDocumentType.PAYMENT_RECEIPT,
      );
      if (!receipt) {
        this.logger.warn(`Reçu introuvable pour le paiement ${paymentId}.`);
        return;
      }

      let attachment: OutgoingEmailAttachment | undefined;
      try {
        const pdf = await this.documents.getPdf(receipt.id, user);
        attachment = {
          filename: `${pdf.number}.pdf`,
          content: pdf.content,
          contentType: "application/pdf",
        };
      } catch (error) {
        this.logger.warn(
          `PDF du reçu ${receipt.number} non joint pour ${paymentId}: ${(error as Error).message}`,
        );
      }

      await this.acknowledgments.sendPaymentReceiptIssued({
        userId: clientUser.id,
        paymentId,
        internalReference: payment.internalReference,
        receiptNumber: receipt.number,
        obligation: null,
        taxReference:
          payment.obligation?.taxReference ?? payment.internalReference,
        taxTypeName:
          payment.taxType?.name ??
          payment.obligation?.taxType?.name ??
          "Impôt / Taxe",
        period: payment.fiscalPeriod ?? "—",
        amount: payment.amount,
        currency: payment.currency,
        mode: payment.mode,
        transactionReference: payment.transactionReference,
        validatedAt: payment.confirmedAt ?? payment.validatedAt ?? new Date(),
        recipientName:
          payment.taxpayer?.legalName?.trim() ||
          [payment.taxpayer?.lastName, payment.taxpayer?.firstName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
          clientUser.name,
        recipientEmail: payment.taxpayer?.email || clientUser.email,
        attachment,
      });
    } catch (error) {
      this.logger.warn(
        `Envoi du reçu non effectué pour ${paymentId}: ${(error as Error).message}`,
      );
    }
  }

  private async notifyConfirmation(paymentId: string) {
    if (!this.acknowledgments) return;
    try {
      const payment = await this.payments.findOne({
        where: { id: paymentId },
        relations: {
          taxpayer: true,
          taxType: true,
          obligation: true,
          documents: true,
        },
      });
      if (!payment) return;
      const clientUser = await this.dataSource
        .getRepository(UserEntity)
        .findOne({ where: { taxpayer: { id: payment.taxpayer.id } } });
      if (!clientUser) return;
      const receipt = (payment.documents ?? []).find(
        (document) => document.type === "RECU_PAIEMENT",
      );
      await this.acknowledgments.sendPaymentDecisionNotification({
        userId: clientUser.id,
        paymentId,
        internalReference: payment.internalReference,
        obligation: null,
        taxReference: receipt?.number ?? payment.internalReference,
        taxTypeName:
          payment.taxType?.name ??
          payment.obligation?.taxType?.name ??
          "Impôt / Taxe",
        period: payment.fiscalPeriod ?? "—",
        amount: payment.amount,
        currency: payment.currency,
        status: PaymentStatus.CONFIRMED,
        reason: null,
        decidedAt: payment.confirmedAt ?? new Date(),
        recipientName:
          payment.taxpayer?.legalName ||
          [payment.taxpayer?.lastName, payment.taxpayer?.firstName]
            .filter(Boolean)
            .join(" "),
        recipientEmail: payment.taxpayer?.email ?? "",
      });
    } catch (error) {
      this.logger.warn(
        `E-mail de confirmation non envoyé pour ${paymentId}: ${(error as Error).message}`,
      );
    }
  }

  private async notifyDecision(paymentId: string) {
    if (!this.acknowledgments) return;
    try {
      const payment = await this.payments.findOne({
        where: { id: paymentId },
        relations: { taxpayer: true, taxType: true, obligation: true },
      });
      if (!payment) return;
      const clientUser = await this.dataSource
        .getRepository(UserEntity)
        .findOne({ where: { taxpayer: { id: payment.taxpayer.id } } });
      if (!clientUser) return;
      await this.acknowledgments.sendPaymentDecisionNotification({
        userId: clientUser.id,
        paymentId,
        internalReference: payment.internalReference,
        obligation: null,
        taxReference:
          payment.obligation?.taxReference ?? payment.internalReference,
        taxTypeName:
          payment.taxType?.name ??
          payment.obligation?.taxType?.name ??
          "Impôt / Taxe",
        period: payment.fiscalPeriod ?? "—",
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        reason: payment.decisionReason,
        decidedAt: payment.validatedAt ?? new Date(),
        recipientName: clientUser.name,
        recipientEmail: payment.taxpayer?.email || clientUser.email,
      });
    } catch (error) {
      this.logger.warn(
        `E-mail de décision non envoyé pour ${paymentId}: ${(error as Error).message}`,
      );
    }
  }
}
