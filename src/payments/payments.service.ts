import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import { DataSource, Repository } from "typeorm";
import { PaymentEventEntity } from "../database/entities/payment-event.entity";
import { ObligationEntity } from "../database/entities/obligation.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import { SRE_REGION } from "../database/region";
import {
  PaymentMethod,
  AccountRole,
  ObligationStatus,
  PaymentStatus,
} from "../database/enums";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { DocumentsService } from "../documents/documents.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { PaymentDecisionDto } from "./dto/payment-decision.dto";

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly payments: Repository<PaymentEntity>,
    private readonly dataSource: DataSource,
    private readonly documents: DocumentsService,
  ) {}

  async createDeclaration(
    user: AuthenticatedUser,
    data: CreatePaymentDto,
  ) {
    if (
      user.role !== AccountRole.CLIENT ||
      !user.taxpayerId
    ) {
      throw new ForbiddenException(
        "Un compte client lié à un contribuable est nécessaire.",
      );
    }

    const paymentId = await this.dataSource.transaction(
      async (manager) => {
        const obligationsRepository = manager.getRepository(ObligationEntity);
        const obligation = await obligationsRepository
          .createQueryBuilder("obligation")
          .leftJoinAndSelect("obligation.taxpayer", "taxpayer")
          .leftJoinAndSelect("obligation.taxType", "taxType")
          .where("obligation.id = :obligationId", {
            obligationId: data.obligationId,
          })
          .andWhere("taxpayer.id = :taxpayerId", {
            taxpayerId: user.taxpayerId,
          })
          .setLock("pessimistic_write", undefined, ["obligation"])
          .getOne();

        if (!obligation)
          throw new NotFoundException("Obligation introuvable pour ce compte.");
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
            "Le canal déclaré est requis pour une déclaration de virement.",
          );
        }

        const referenceUnique = randomUUID()
          .replaceAll("-", "")
          .slice(0, 12)
          .toUpperCase();
        const internalReference = `PAY-${new Date().getFullYear()}-${referenceUnique}`;
        const paymentsRepository = manager.getRepository(PaymentEntity);
        const payment = paymentsRepository.create({
          internalReference,
          taxpayer: obligation.taxpayer,
          obligation,
          amount: obligation.amount,
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
          transactionDate: data.dateTransaction.slice(0, 10),
          supportingDocumentName: this.sanitizeSupportingDocumentName(
            data.justificatifNom,
          ),
          status: PaymentStatus.UNDER_REVIEW,
          validatedAt: null,
          validatedBy: null,
          decisionReason: null,
        });
        const savedPayment = await paymentsRepository.save(payment);

        obligation.status = ObligationStatus.UNDER_REVIEW;
        await obligationsRepository.save(obligation);

        const paymentEventsRepository = manager.getRepository(PaymentEventEntity);
        const event = paymentEventsRepository.create({
          payment: savedPayment,
          status: PaymentStatus.UNDER_REVIEW,
          label: "Déclaration soumise — paiement non vérifié",
          actor: manager
            .getRepository(UserEntity)
            .create({ id: user.id }),
          actorName: user.name,
          reason: null,
        });
        await paymentEventsRepository.save(event);
        await this.documents.createAcknowledgment(manager, {
          ...savedPayment,
          taxpayer: obligation.taxpayer,
          obligation,
        });
        return savedPayment.id;
      },
    );

    return this.getOne(paymentId, user);
  }

  async listMyPayments(user: AuthenticatedUser) {
    if (!user.taxpayerId) return [];
    const rows = await this.buildQuery()
      .where("taxpayer.id = :taxpayerId", {
        taxpayerId: user.taxpayerId,
      })
      .andWhere("taxpayer.region = :region", { region: SRE_REGION })
      .orderBy("payment.submittedAt", "DESC")
      .getMany();
    return rows.map((payment) => this.toPaymentView(payment));
  }

  async listForAdministration(
    status?: PaymentStatus,
    page = 1,
    perPage = 25,
  ) {
    const pageNumber = Math.max(1, Math.floor(page) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(perPage) || 25));
    const request = this.buildQuery()
      .where("taxpayer.region = :region", { region: SRE_REGION })
      .orderBy("payment.submittedAt", "DESC");
    if (status) request.andWhere("payment.status = :status", { status: status });
    const [rows, total] = await request
      .skip((pageNumber - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {
      donnees: rows.map((payment) => this.toPaymentView(payment)),
      total,
      page: pageNumber,
      parPage: pageSize,
    };
  }

  async getOne(id: string, user: AuthenticatedUser) {
    const request = this.buildQuery()
      .where("payment.id = :paymentId", { paymentId: id })
      .andWhere("taxpayer.region = :region", { region: SRE_REGION });
    if (user.role !== AccountRole.ADMIN) {
      if (!user.taxpayerId)
        throw new NotFoundException("Déclaration introuvable.");
      request.andWhere("taxpayer.id = :taxpayerId", {
        taxpayerId: user.taxpayerId,
      });
    }
    const payment = await request.getOne();
    if (!payment) throw new NotFoundException("Déclaration introuvable.");
    return this.toPaymentView(payment);
  }

  async decide(
    id: string,
    user: AuthenticatedUser,
    data: PaymentDecisionDto,
  ) {
    if (user.role !== AccountRole.ADMIN)
      throw new ForbiddenException("Décision réservée à l'administration.");
    const status = data.statut;
    if (
      ![
        PaymentStatus.CONFIRMED,
        PaymentStatus.REJECTED,
        PaymentStatus.CORRECTION_REQUESTED,
      ].includes(status)
    ) {
      throw new BadRequestException("Statut de décision invalide.");
    }
    if (
      status !== PaymentStatus.CONFIRMED &&
      (!data.motif || data.motif.trim().length < 5)
    ) {
      throw new BadRequestException(
        "Un motif d'au moins 5 caractères est requis pour cette décision.",
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const paymentsRepository = manager.getRepository(PaymentEntity);
      const lock = await paymentsRepository
        .createQueryBuilder("payment")
        .where("payment.id = :paymentId", { paymentId: id })
        .setLock("pessimistic_write")
        .getOne();
      if (!lock) throw new NotFoundException("Déclaration introuvable.");
      if (lock.status !== PaymentStatus.UNDER_REVIEW) {
        throw new ConflictException(
          "Une décision a déjà été enregistrée pour cette déclaration.",
        );
      }

      const payment = await paymentsRepository.findOne({
        where: { id, taxpayer: { region: SRE_REGION } },
        relations: { taxpayer: true, obligation: { taxType: true } },
      });
      if (!payment)
        throw new NotFoundException(
          "Déclaration introuvable dans le périmètre du service.",
        );
      const obligationsRepository = manager.getRepository(ObligationEntity);
      const obligation = await obligationsRepository
        .createQueryBuilder("obligation")
        .where("obligation.id = :obligationId", {
          obligationId: payment.obligation.id,
        })
        .setLock("pessimistic_write")
        .getOne();
      if (!obligation)
        throw new NotFoundException("Obligation liée introuvable.");

      const administrator = manager
        .getRepository(UserEntity)
        .create({ id: user.id });
      const dateDecision = new Date();
      const reason = data.motif?.trim() || null;
      payment.status = status;
      payment.validatedAt =
        status === PaymentStatus.CONFIRMED ? dateDecision : null;
      payment.validatedBy = administrator;
      payment.decisionReason = reason;
      await paymentsRepository.save(payment);

      obligation.status =
        status === PaymentStatus.CONFIRMED
          ? ObligationStatus.PAID
          : status === PaymentStatus.REJECTED
            ? ObligationStatus.REJECTED
            : ObligationStatus.CORRECTION_REQUESTED;
      await obligationsRepository.save(obligation);

      const label =
        status === PaymentStatus.CONFIRMED
          ? "Déclaration confirmée par une décision administrative — hors vérification bancaire"
          : status === PaymentStatus.REJECTED
            ? "Déclaration rejetée"
            : "Correction demandée";
      const event = manager.getRepository(PaymentEventEntity).create({
        payment,
        status,
        label,
        actor: administrator,
        actorName: user.name,
        reason,
        createdAt: dateDecision,
      });
      await manager.getRepository(PaymentEventEntity).save(event);

      if (status === PaymentStatus.CONFIRMED) {
        await this.documents.createInternalReceipt(
          manager,
          payment,
          administrator,
        );
      }
    });

    return this.getOne(id, user);
  }

  private buildQuery() {
    return this.payments
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.taxpayer", "taxpayer")
      .leftJoinAndSelect("payment.obligation", "obligation")
      .leftJoinAndSelect("obligation.taxType", "taxType")
      .leftJoinAndSelect("payment.history", "history")
      .leftJoinAndSelect("payment.documents", "documents");
  }

  private toPaymentView(payment: PaymentEntity) {
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
            courriel: payment.taxpayer.email,
          }
        : undefined,
      obligationId: payment.obligation?.id,
      typeImpotId: payment.obligation?.taxType?.id,
      typeImpotNom: payment.obligation?.taxType?.name,
      referenceFiscale: payment.obligation?.taxReference,
      periode: payment.obligation?.period,
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
      valideLe: payment.validatedAt,
      validePar: payment.validatedBy?.name,
      motifRejet: payment.decisionReason,
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
          typeImpotNom: payment.obligation?.taxType?.name,
          periode: payment.obligation?.period,
          referenceTransactionDeclaree: payment.transactionReference,
          modeDeclare: payment.mode,
          emetteur: document.issuer,
          mention: document.mention,
          emisPar: document.issuedBy?.name,
          lienPdf: `/documents/${document.id}/pdf`,
        })),
    };
  }

  private sanitizeSupportingDocumentName(name?: string) {
    if (!name) return null;
    const cleaned = name
      .replace(/[\\/]/g, "_")
      .replace(/[\u0000-\u001f]/g, "")
      .trim();
    return cleaned.slice(0, 200) || null;
  }
}
