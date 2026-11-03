import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { EntityManager, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { genererPdfRecuFiscal } from "./recu-fiscal-pdf";
import { normalizeDocumentIssuer } from "./document-issuer";
import { PaymentDocumentEntity } from "../database/entities/payment-document.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  AccountRole,
  DocumentStatus,
  PaymentDocumentType,
  PaymentStatus,
} from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

const RECEIPT_TYPE = PaymentDocumentType.PAYMENT_RECEIPT;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly configuration: ConfigService,
    @InjectRepository(PaymentDocumentEntity)
    private readonly documents: Repository<PaymentDocumentEntity>,
  ) {}

  /**
   * Reçu de paiement, émis dès la validation de la déclaration (validation
   * automatique à la soumission).
   * Idempotent : l'index unique (paiement, type) empêche tout second reçu définitif.
   */
  async ensureReceipt(manager: EntityManager, payment: PaymentEntity) {
    if (payment.status !== PaymentStatus.CONFIRMED) {
      // Garde-fou : aucun reçu définitif sur un paiement non confirmé.
      return null;
    }
    const existing = await manager.getRepository(PaymentDocumentEntity).findOne({
      where: { payment: { id: payment.id }, type: RECEIPT_TYPE },
    });
    if (existing) return existing;

    try {
      return await this.createDocument(
        manager,
        payment,
        RECEIPT_TYPE,
        payment.validatedBy ?? null,
      );
    } catch (error) {
      // Course entre deux confirmations concurrentes : l'index unique tranche.
      const existingAfterRace = await manager
        .getRepository(PaymentDocumentEntity)
        .findOne({
          where: { payment: { id: payment.id }, type: RECEIPT_TYPE },
        });
      if (existingAfterRace) return existingAfterRace;
      throw error;
    }
  }

  async listMyDocuments(taxpayerId: string) {
    if (!taxpayerId) return [];
    const documents = await this.documents.find({
      where: { taxpayer: { id: taxpayerId, region: SRE_REGION } },
      relations: {
        taxpayer: true,
        payment: { taxType: true, obligation: { taxType: true } },
      },
      order: { issuedAt: "DESC" },
    });
    return documents.map((document) => this.toDocumentView(document));
  }

  async getDocument(id: string, user: AuthenticatedUser) {
    const document = await this.loadDocument(id);
    this.checkAccess(document, user);
    return this.toDocumentView(document, true);
  }

  async getPdf(id: string, user: AuthenticatedUser) {
    const document = await this.loadDocument(id);
    this.checkAccess(document, user);
    return {
      number: document.number,
      content: await this.generatePdf(document),
    };
  }

  /**
   * Vérification publique d'un document à partir de son numéro et de son code :
   * permet de contrôler l'authenticité d'un reçu imprimé sans exposer les données.
   */
  async verifyDocument(number: string, code: string) {
    const document = await this.documents.findOne({
      where: { number: number.trim().toUpperCase() },
      relations: {
        taxpayer: true,
        payment: { taxType: true, obligation: { taxType: true } },
      },
    });
    if (document?.status !== DocumentStatus.VALID) {
      return { valide: false, motif: "Document inconnu ou annulé." };
    }
    const expected = this.verificationCode(document);
    if (
      !document.verificationCode ||
      expected !== (code ?? "").trim().toUpperCase()
    ) {
      return { valide: false, motif: "Code de vérification incorrect." };
    }
    return {
      valide: true,
      numero: document.number,
      type: document.type,
      montant: Number(document.amount),
      devise: document.currency,
      emisLe: document.issuedAt,
      emetteur: normalizeDocumentIssuer(document.issuer),
      referencePaiement: document.payment?.internalReference ?? null,
      statutPaiement: document.payment?.status ?? null,
      natureImpot:
        document.payment?.taxType?.name ??
        document.payment?.obligation?.taxType?.name ??
        null,
      periode:
        document.payment?.fiscalPeriod ??
        document.payment?.obligation?.period ??
        null,
      confirmeLe: document.payment?.confirmedAt ?? null,
      contribuable:
        document.taxpayer?.legalName ||
        [document.taxpayer?.lastName, document.taxpayer?.firstName]
          .filter(Boolean)
          .join(" "),
    };
  }

  /** URL publique de contrôle d'authenticité imprimée sur le document. */
  private publicVerificationUrl(numero: string, code: string | null): string {
    let base = this.configuration.get<string>("API_PUBLIC_URL", "").trim();
    while (base.endsWith("/")) {
      base = base.slice(0, -1);
    }
    const query = new URLSearchParams({ numero, code: code ?? "" }).toString();
    return `${base || ""}/documents/verifier?${query}`;
  }

  private async loadDocument(id: string) {
    const document = await this.documents.findOne({
      where: { id },
      relations: {
        payment: { taxType: true, obligation: { taxType: true } },
        taxpayer: true,
        issuedBy: true,
      },
    });
    if (!document)
      throw new NotFoundException("Document de paiement introuvable.");
    return document;
  }

  private checkAccess(
    document: PaymentDocumentEntity,
    user: AuthenticatedUser,
  ) {
    if (
      document.status !== DocumentStatus.VALID ||
      document.taxpayer.region !== SRE_REGION
    ) {
      throw new NotFoundException(
        "Ce document n'est pas disponible dans le périmètre du service.",
      );
    }
    if (
      user.role !== AccountRole.ADMIN &&
      document.taxpayer.id !== user.taxpayerId
    ) {
      throw new ForbiddenException("Ce document ne vous appartient pas.");
    }
  }

  /** Code d'authentification du document (HMAC tronqué, non réversible). */
  private verificationCode(document: PaymentDocumentEntity) {
    const secret =
      this.configuration.get<string>("RECEIPT_SECRET")?.trim() ||
      this.configuration.get<string>("JWT_SECRET") ||
      "sre-document-secret";
    return createHmac("sha256", secret)
      .update(
        [
          document.number,
          document.amount,
          document.currency,
          document.payment?.id ?? "",
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 16)
      .toUpperCase();
  }

  private taxTypeName(payment: PaymentEntity) {
    return (
      payment.taxType?.name ??
      payment.obligation?.taxType?.name ??
      "Nature d'impôt non précisée"
    );
  }

  private fiscalPeriod(payment: PaymentEntity) {
    return payment.fiscalPeriod ?? payment.obligation?.period ?? "—";
  }

  private taxpayerName(payment: PaymentEntity) {
    return (
      payment.taxpayer?.legalName?.trim() ||
      [payment.taxpayer?.firstName, payment.taxpayer?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      "Contribuable"
    );
  }

  private async createDocument(
    manager: EntityManager,
    payment: PaymentEntity,
    type: PaymentDocumentType,
    issuerUser: UserEntity | null,
  ) {
    // L'identité du contribuable doit figurer sur le document : la relation peut
    // n'être transmise que par sa clé primaire, on la recharge dans ce cas.
    const taxpayerId = payment.taxpayer?.id;
    const taxpayerIncomplete =
      !payment.taxpayer?.legalName?.trim() && !payment.taxpayer?.firstName?.trim();
    if (taxpayerId && taxpayerIncomplete) {
      const complete = await manager
        .getRepository(TaxpayerEntity)
        .findOne({ where: { id: taxpayerId } });
      if (complete) payment.taxpayer = complete;
    }
    if (payment.taxType?.id && !payment.taxType.name) {
      const complete = await manager
        .getRepository(TaxTypeEntity)
        .findOne({ where: { id: payment.taxType.id } });
      if (complete) payment.taxType = complete;
    }

    const issueDate = new Date();
    const year = issueDate.getFullYear();
    const suffix = payment.internalReference
      .replace(/[^A-Z0-9]/gi, "")
      .slice(-12)
      .toUpperCase();
    const prefix =
      type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT ? "ACC" : "REC";
    const number = `SRE-${prefix}-${year}-${suffix}`;
    const issuer = normalizeDocumentIssuer(
      this.configuration.get<string>("DOCUMENT_ISSUER"),
    );
    const mention =
      type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
        ? "Accusé de réception de la déclaration. Ce document confirme uniquement la soumission des informations déclarées par l'usager. Il ne confirme pas la réception de fonds ni le règlement d'un impôt."
        : "Reçu de paiement émis automatiquement dès la validation de la déclaration soumise sur le portail. Il atteste l'enregistrement du paiement et de son montant dans les systèmes du service ; il ne remplace pas le reçu ou le relevé émis par la banque ou l'opérateur mobile-money.";

    const snapshot: Record<string, unknown> = {
      titre:
        type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
          ? "Accusé de déclaration fiscale"
          : "Reçu de versement fiscal",
      numero: number,
      type,
      emisLe: issueDate.toISOString(),
      emetteur: issuer,
      montant: payment.amount,
      devise: payment.currency,
      statutPaiement: payment.status,
      contribuable: {
        nom: this.taxpayerName(payment),
        nif: payment.taxpayer.nif,
        stat: payment.taxpayer.stat,
        type: payment.taxpayer.type,
        courriel: payment.taxpayer.email,
        telephone: payment.taxpayer.phone ?? null,
        adresse: payment.taxpayer.address,
        ville: payment.taxpayer.city,
      },
      impot: {
        nature: this.taxTypeName(payment),
        code: payment.taxType?.code ?? null,
        periode: this.fiscalPeriod(payment),
        debutPeriode: payment.periodStart,
        finPeriode: payment.periodEnd,
      },
      paiement: {
        referenceInterne: payment.internalReference,
        referenceTransactionDeclaree: payment.transactionReference,
        dateTransactionDeclaree: payment.transactionDate,
        modeDeclare: payment.mode,
        operateur: payment.operator,
        canal: payment.bankOrChannel,
        statut: payment.status,
        confirmeLe: payment.confirmedAt?.toISOString() ?? null,
        fournisseur: payment.provider ?? null,
        referenceFournisseur: payment.providerReference ?? null,
        origine: payment.origin,
        obligationReference: payment.obligation?.taxReference ?? null,
      },
      mention,
      emettePar: issuerUser?.name ?? "Système (génération automatique)",
    };

    const repository = manager.getRepository(PaymentDocumentEntity);
    const document = repository.create({
      number,
      type,
      status: DocumentStatus.VALID,
      payment,
      taxpayer: payment.taxpayer,
      issuedBy: issuerUser,
      amount: payment.amount,
      currency: payment.currency,
      issuer,
      mention,
      snapshot,
      issuedAt: issueDate,
      verificationCode: null,
    });
    document.verificationCode = this.verificationCode(document);
    snapshot.codeVerification = document.verificationCode;
    return repository.save(document);
  }

  private toDocumentView(document: PaymentDocumentEntity, detail = false) {
    const snapshot = document.snapshot ?? {};
    const impot = (snapshot.impot ?? {}) as Record<string, unknown>;
    const legacyObligation = (snapshot.obligation ?? {}) as Record<string, unknown>;
    const paiement = (snapshot.paiement ?? {}) as Record<string, unknown>;
    const payment = document.payment;
    const asText = (value: unknown, fallback: string): string => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return fallback;
    };
    return {
      id: document.id,
      numero: document.number,
      type: document.type,
      statut: document.status,
      paiementId: payment?.id,
      referencePaiement: payment?.internalReference,
      contribuableId: document.taxpayer?.id,
      montant: Number(document.amount),
      devise: document.currency,
      emetteur: normalizeDocumentIssuer(document.issuer),
      mention: document.mention,
      emisLe: document.issuedAt,
      codeVerification: document.verificationCode,
      typeImpotNom: asText(
        impot.nature ??
          legacyObligation.typeImpot ??
          payment?.taxType?.name ??
          payment?.obligation?.taxType?.name,
        "Type d'impôt",
      ),
      periode: asText(
        impot.periode ??
          legacyObligation.periode ??
          payment?.fiscalPeriod ??
          payment?.obligation?.period,
        "—",
      ),
      referenceTransactionDeclaree: asText(
        paiement.referenceTransactionDeclaree,
        "—",
      ),
      modeDeclare: asText(paiement.modeDeclare, "—"),
      statutPaiement: asText(paiement.statut ?? payment?.status, "—"),
      confirmeLe:
        (paiement.confirmeLe as string | null | undefined) ??
        payment?.confirmedAt ??
        null,
      emisPar:
        typeof snapshot.emettePar === "string"
          ? snapshot.emettePar
          : undefined,
      lienPdf: `/documents/${document.id}/pdf`,
      ...(detail ? { instantane: document.snapshot } : {}),
    };
  }

  private async generatePdf(document: PaymentDocumentEntity): Promise<Buffer> {
    const snapshot = document.snapshot ?? {};
    const taxpayer = (snapshot.contribuable ?? {}) as Record<string, unknown>;
    const impot = (snapshot.impot ?? {}) as Record<string, unknown>;
    const legacyObligation = (snapshot.obligation ?? {}) as Record<string, unknown>;
    const paiement = (snapshot.paiement ?? {}) as Record<string, unknown>;
    const isReceipt = document.type === RECEIPT_TYPE;
    const timezone = this.configuration.get<string>(
      "FUSEAU_HORAIRE",
      "Indian/Antananarivo",
    );
    const dbTaxpayer = document.taxpayer;
    const dbPayment = document.payment;
    const texte = (valeur: unknown): string | null => {
      if (valeur === undefined || valeur === null) return null;
      if (
        typeof valeur === "string" ||
        typeof valeur === "number" ||
        typeof valeur === "boolean"
      ) {
        const propre = String(valeur).trim();
        return propre.length > 0 ? propre : null;
      }
      return null;
    };

    const statutPaiement =
      texte(paiement.statut) ?? texte(dbPayment?.status) ?? "—";

    const nomContribuable =
      texte(taxpayer.nom) ??
      texte(dbTaxpayer?.legalName) ??
      (texte(
        [dbTaxpayer?.firstName, dbTaxpayer?.lastName].filter(Boolean).join(" "),
      ) ||
        "Contribuable");

    return genererPdfRecuFiscal({
      estRecuDefinitif: isReceipt,
      numero: document.number,
      emetteur: normalizeDocumentIssuer(document.issuer),
      emisLe: document.issuedAt,
      fuseauHoraire: timezone,
      montant: Number(document.amount),
      devise: document.currency,
      statutPaiement,
      codeVerification: document.verificationCode,
      urlVerification: this.publicVerificationUrl(
        document.number,
        document.verificationCode,
      ),
      mention: document.mention,
      contribuable: {
        nom: nomContribuable,
        nif: texte(taxpayer.nif) ?? texte(dbTaxpayer?.nif),
        stat: texte(taxpayer.stat) ?? texte(dbTaxpayer?.stat),
        adresse: texte(taxpayer.adresse) ?? texte(dbTaxpayer?.address),
        ville: texte(taxpayer.ville) ?? texte(dbTaxpayer?.city),
        telephone: texte(taxpayer.telephone) ?? texte(dbTaxpayer?.phone),
        courriel: texte(taxpayer.courriel) ?? texte(dbTaxpayer?.email),
      },
      impot: {
        nature:
          texte(impot.nature) ??
          texte(legacyObligation.typeImpot) ??
          texte(dbPayment?.taxType?.name) ??
          texte(dbPayment?.obligation?.taxType?.name) ??
          "Nature d'impôt",
        code:
          texte(impot.code) ??
          texte(dbPayment?.taxType?.code) ??
          texte(dbPayment?.obligation?.taxType?.code),
        periode:
          texte(impot.periode) ??
          texte(legacyObligation.periode) ??
          texte(dbPayment?.fiscalPeriod) ??
          texte(dbPayment?.obligation?.period) ??
          "—",
      },
      paiement: {
        referenceInterne:
          texte(paiement.referenceInterne) ??
          texte(dbPayment?.internalReference) ??
          "—",
        referenceTransactionDeclaree:
          texte(paiement.referenceTransactionDeclaree) ??
          texte(dbPayment?.transactionReference) ??
          "—",
        modeDeclare:
          texte(paiement.modeDeclare) ?? texte(dbPayment?.mode) ?? "—",
        operateur: texte(paiement.operateur) ?? texte(dbPayment?.operator),
        canal: texte(paiement.canal) ?? texte(dbPayment?.bankOrChannel),
        confirmeLe:
          texte(paiement.confirmeLe) ??
          (dbPayment?.confirmedAt ? dbPayment.confirmedAt.toISOString() : null),
        dateTransactionDeclaree:
          texte(paiement.dateTransactionDeclaree) ??
          texte(dbPayment?.transactionDate),
        obligationReference:
          texte(paiement.obligationReference) ??
          texte(dbPayment?.obligation?.taxReference),
        origine: texte(paiement.origine) ?? texte(dbPayment?.origin),
      },
    });
  }

  /** Utilitaire de diagnostic : nombre de documents émis pour un paiement. */
  async countDocuments(paymentId: string) {
    return this.documents.count({ where: { payment: { id: paymentId } } });
  }

  logMissingReceipt(paymentId: string) {
    this.logger.error(`Reçu absent pour le paiement confirmé ${paymentId}.`);
  }
}
