import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PDFDocument from "pdfkit";
import { EntityManager, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { PaymentDocumentEntity } from "../database/entities/payment-document.entity";
import { PaymentEntity } from "../database/entities/payment.entity";
import { UserEntity } from "../database/entities/user.entity";
import {
  AccountRole,
  DocumentStatus,
  PaymentDocumentType,
} from "../database/enums";
import { SRE_REGION } from "../database/region";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly configuration: ConfigService,
    @InjectRepository(PaymentDocumentEntity)
    private readonly documents: Repository<PaymentDocumentEntity>,
  ) {}

  async createAcknowledgment(manager: EntityManager, payment: PaymentEntity) {
    return this.createDocument(
      manager,
      payment,
      PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT,
      null,
    );
  }

  async createInternalReceipt(
    manager: EntityManager,
    payment: PaymentEntity,
    administrator: UserEntity,
  ) {
    return this.createDocument(
      manager,
      payment,
      PaymentDocumentType.PAYMENT_RECEIPT,
      administrator,
    );
  }

  async listMyDocuments(taxpayerId: string) {
    const documents = await this.documents.find({
      where: { taxpayer: { id: taxpayerId, region: SRE_REGION } },
      relations: {
        taxpayer: true,
        payment: { obligation: { taxType: true } },
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

  async getPdf(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ number: string; content: Buffer }> {
    const document = await this.loadDocument(id);
    this.checkAccess(document, user);
    return {
      number: document.number,
      content: await this.generatePdf(document),
    };
  }

  private async loadDocument(id: string) {
    const document = await this.documents.findOne({
      where: { id },
      relations: {
        payment: { obligation: { taxType: true } },
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

  private async createDocument(
    manager: EntityManager,
    payment: PaymentEntity,
    type: PaymentDocumentType,
    administrator: UserEntity | null,
  ) {
    const issueDate = new Date();
    const year = issueDate.getFullYear();
    const suffix = payment.internalReference
      .replace(/[^A-Z0-9]/gi, "")
      .slice(-12)
      .toUpperCase();
    const prefix =
      type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT ? "ACC" : "REC";
    const number = `SRE-${prefix}-${year}-${suffix}`;
    const issuer = this.configuration.get<string>(
      "DOCUMENT_ISSUER",
      "SRE · document interne",
    );
    const mention =
      type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
        ? "Accusé de réception de la déclaration. Ce document confirme uniquement la soumission des informations déclarées par l'usager. Il ne confirme pas la réception de fonds ni le règlement d'un impôt."
        : "Reçu interne SRE émis après une décision administrative de confirmation. Aucun prestataire bancaire ou mobile-money n'étant connecté, ce document ne constitue pas un reçu bancaire, une preuve de transfert ni une confirmation indépendante de réception de fonds.";

    const snapshot: Record<string, unknown> = {
      titre:
        type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
          ? "Accusé de réception de déclaration"
          : "Reçu interne SRE",
      numero: number,
      type,
      emisLe: issueDate.toISOString(),
      emetteur: issuer,
      montant: payment.amount,
      devise: payment.currency,
      contribuable: {
        nom:
          payment.taxpayer.legalName ||
          [payment.taxpayer.firstName, payment.taxpayer.lastName]
            .filter(Boolean)
            .join(" "),
        nif: payment.taxpayer.nif,
        courriel: payment.taxpayer.email,
      },
      obligation: {
        referenceFiscale: payment.obligation.taxReference,
        typeImpot: payment.obligation.taxType?.name ?? "Type d'impôt",
        periode: payment.obligation.period,
      },
      paiement: {
        referenceInterne: payment.internalReference,
        referenceTransactionDeclaree: payment.transactionReference,
        dateTransactionDeclaree: payment.transactionDate,
        modeDeclare: payment.mode,
        statut: payment.status,
      },
      mention,
      emettePar: administrator?.name ?? null,
    };

    const repository = manager.getRepository(PaymentDocumentEntity);
    const document = repository.create({
      number,
      type,
      status: DocumentStatus.VALID,
      payment,
      taxpayer: payment.taxpayer,
      issuedBy: administrator,
      amount: payment.amount,
      currency: payment.currency,
      issuer,
      mention,
      snapshot,
      issuedAt: issueDate,
    });
    return repository.save(document);
  }

  private toDocumentView(document: PaymentDocumentEntity, detail = false) {
    const snapshot = document.snapshot;
    const obligation = (snapshot.obligation ?? {}) as Record<string, unknown>;
    const payment = (snapshot.paiement ?? {}) as Record<string, unknown>;
    return {
      id: document.id,
      numero: document.number,
      type: document.type,
      statut: document.status,
      paiementId: document.payment?.id,
      referencePaiement: document.payment?.internalReference,
      contribuableId: document.taxpayer?.id,
      montant: Number(document.amount),
      devise: document.currency,
      emetteur: document.issuer,
      mention: document.mention,
      emisLe: document.issuedAt,
      typeImpotNom: String(
        obligation.typeImpot ??
          document.payment?.obligation?.taxType?.name ??
          "Type d'impôt",
      ),
      periode: String(
        obligation.periode ?? document.payment?.obligation?.period ?? "—",
      ),
      referenceTransactionDeclaree: String(
        payment.referenceTransactionDeclaree ?? "—",
      ),
      modeDeclare: String(payment.modeDeclare ?? "—"),
      emisPar:
        typeof snapshot.emettePar === "string"
          ? snapshot.emettePar
          : undefined,
      lienPdf: `/documents/${document.id}/pdf`,
      ...(detail ? { instantane: document.snapshot } : {}),
    };
  }

  private async generatePdf(document: PaymentDocumentEntity): Promise<Buffer> {
    const snapshot = document.snapshot;
    const taxpayer = (snapshot.contribuable ?? {}) as Record<
      string,
      unknown
    >;
    const obligation = (snapshot.obligation ?? {}) as Record<string, unknown>;
    const payment = (snapshot.paiement ?? {}) as Record<string, unknown>;
    const parts: Buffer[] = [];
    return new Promise((resoudre, rejeter) => {
      const pdf = new PDFDocument({
        size: "A4",
        margin: 52,
        info: { Title: document.number, Author: document.issuer },
      });
      pdf.on("data", (part: Buffer) => parts.push(part));
      pdf.on("end", () => resoudre(Buffer.concat(parts)));
      pdf.on("error", rejeter);

      pdf
        .fillColor("#12243a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(document.issuer.toUpperCase());
      pdf.moveDown(2);
      const title =
        document.type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
          ? "ACCUSÉ DE RÉCEPTION DE DÉCLARATION"
          : "REÇU INTERNE SRE";
      pdf.fontSize(19).text(title, { align: "left" });
      pdf.moveDown(0.5);
      pdf
        .fillColor("#52627a")
        .font("Helvetica")
        .fontSize(10)
        .text(`Document n° ${document.number}`);
      pdf.text(
        `Émis le ${new Date(document.issuedAt).toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" })} (heure d'Antananarivo)`,
      );
      pdf.moveDown(1.4);
      pdf.strokeColor("#d8e0e9").moveTo(52, pdf.y).lineTo(543, pdf.y).stroke();
      pdf.moveDown(1);

      pdf
        .fillColor("#12243a")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Contribuable");
      pdf.moveDown(0.4);
      pdf
        .font("Helvetica")
        .fontSize(10)
        .text(`Nom / raison sociale : ${String(taxpayer.nom ?? "—")}`);
      pdf.text(`NIF : ${String(taxpayer.nif ?? "—")}`);
      pdf.text(`Courriel : ${String(taxpayer.courriel ?? "—")}`);
      pdf.moveDown(1);

      pdf.font("Helvetica-Bold").fontSize(12).text("Déclaration associée");
      pdf.moveDown(0.4);
      pdf
        .font("Helvetica")
        .fontSize(10)
        .text(
          `Référence interne : ${document.payment?.internalReference ?? "—"}`,
        );
      pdf.text(
        `Impôt / période : ${String(obligation.typeImpot ?? "—")} · ${String(obligation.periode ?? "—")}`,
      );
      pdf.text(
        `Référence d'obligation : ${String(obligation.referenceFiscale ?? "—")}`,
      );
      pdf.text(
        `Référence de transaction déclarée : ${String(payment.referenceTransactionDeclaree ?? "—")}`,
      );
      pdf.text(`Mode déclaré : ${String(payment.modeDeclare ?? "—")}`);
      pdf.moveDown(1.2);

      pdf
        .fillColor("#12243a")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text("Montant déclaré");
      pdf.moveDown(0.3);
      pdf
        .fontSize(19)
        .text(
          `${new Intl.NumberFormat("fr-FR").format(Number(document.amount))} ${document.currency}`,
        );
      pdf.moveDown(1.1);

      const alert =
        document.type === PaymentDocumentType.DECLARATION_ACKNOWLEDGMENT
          ? "ACCUSÉ DE SOUMISSION — PAS UNE PREUVE DE PAIEMENT"
          : "REÇU INTERNE DE DÉCISION — PAS UNE PREUVE BANCAIRE";
      pdf.fillColor("#9a4d0b").font("Helvetica-Bold").fontSize(10).text(alert);
      pdf.moveDown(0.4);
      pdf
        .fillColor("#334155")
        .font("Helvetica")
        .fontSize(9)
        .text(document.mention, { width: 490, lineGap: 3 });
      pdf.moveDown(2);
      pdf
        .fillColor("#718096")
        .fontSize(8)
        .text(
          "Document généré par le portail SRE. Aucun transfert de fonds n'est exécuté par cette API.",
          { width: 490 },
        );
      pdf.end();
    });
  }
}
