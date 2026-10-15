import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PDFDocument from "pdfkit";
import { EntityManager, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { TaxpayerEntity } from "../database/entities/taxpayer.entity";
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

  async creerAccuse(gestionnaire: EntityManager, paiement: PaymentEntity) {
    return this.creerDocument(
      gestionnaire,
      paiement,
      PaymentDocumentType.ACCUSE_DECLARATION,
      null,
    );
  }

  async creerRecuInterne(
    gestionnaire: EntityManager,
    paiement: PaymentEntity,
    administrateur: UserEntity,
  ) {
    return this.creerDocument(
      gestionnaire,
      paiement,
      PaymentDocumentType.RECU_PAIEMENT,
      administrateur,
    );
  }

  async listerMesDocuments(idContribuable: string) {
    const documents = await this.documents.find({
      where: { contribuable: { id: idContribuable, region: SRE_REGION } },
      relations: {
        contribuable: true,
        paiement: { obligation: { typeImpot: true } },
      },
      order: { emisLe: "DESC" },
    });
    return documents.map((document) => this.vueDocument(document));
  }

  async obtenirDocument(id: string, utilisateur: AuthenticatedUser) {
    const document = await this.chargerDocument(id);
    this.verifierAcces(document, utilisateur);
    return this.vueDocument(document, true);
  }

  async obtenirPdf(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<{ numero: string; contenu: Buffer }> {
    const document = await this.chargerDocument(id);
    this.verifierAcces(document, utilisateur);
    return {
      numero: document.numero,
      contenu: await this.genererPdf(document),
    };
  }

  private async chargerDocument(id: string) {
    const document = await this.documents.findOne({
      where: { id },
      relations: {
        paiement: { obligation: { typeImpot: true } },
        contribuable: true,
        emisPar: true,
      },
    });
    if (!document)
      throw new NotFoundException("Document de paiement introuvable.");
    return document;
  }

  private verifierAcces(
    document: PaymentDocumentEntity,
    utilisateur: AuthenticatedUser,
  ) {
    if (
      document.statut !== DocumentStatus.VALIDE ||
      document.contribuable.region !== SRE_REGION
    ) {
      throw new NotFoundException(
        "Ce document n'est pas disponible dans le périmètre du service.",
      );
    }
    if (
      utilisateur.role !== AccountRole.ADMIN &&
      document.contribuable.id !== utilisateur.contribuableId
    ) {
      throw new ForbiddenException("Ce document ne vous appartient pas.");
    }
  }

  private async creerDocument(
    gestionnaire: EntityManager,
    paiement: PaymentEntity,
    type: PaymentDocumentType,
    administrateur: UserEntity | null,
  ) {
    const dateEmission = new Date();
    const annee = dateEmission.getFullYear();
    const suffixe = paiement.referenceInterne
      .replace(/[^A-Z0-9]/gi, "")
      .slice(-12)
      .toUpperCase();
    const prefixe =
      type === PaymentDocumentType.ACCUSE_DECLARATION ? "ACC" : "REC";
    const numero = `SRE-${prefixe}-${annee}-${suffixe}`;
    const emetteur = this.configuration.get<string>(
      "DOCUMENT_ISSUER",
      "SRE · document interne",
    );
    const mention =
      type === PaymentDocumentType.ACCUSE_DECLARATION
        ? "Accusé de réception de la déclaration. Ce document confirme uniquement la soumission des informations déclarées par l'usager. Il ne confirme pas la réception de fonds ni le règlement d'un impôt."
        : "Reçu interne SRE émis après une décision administrative de confirmation. Aucun prestataire bancaire ou mobile-money n'étant connecté, ce document ne constitue pas un reçu bancaire, une preuve de transfert ni une confirmation indépendante de réception de fonds.";

    const instantane: Record<string, unknown> = {
      titre:
        type === PaymentDocumentType.ACCUSE_DECLARATION
          ? "Accusé de réception de déclaration"
          : "Reçu interne SRE",
      numero,
      type,
      emisLe: dateEmission.toISOString(),
      emetteur,
      montant: paiement.montant,
      devise: paiement.devise,
      contribuable: {
        nom:
          paiement.contribuable.raisonSociale ||
          [paiement.contribuable.prenom, paiement.contribuable.nom]
            .filter(Boolean)
            .join(" "),
        nif: paiement.contribuable.nif,
        courriel: paiement.contribuable.courriel,
      },
      obligation: {
        referenceFiscale: paiement.obligation.referenceFiscale,
        typeImpot: paiement.obligation.typeImpot?.nom ?? "Type d'impôt",
        periode: paiement.obligation.periode,
      },
      paiement: {
        referenceInterne: paiement.referenceInterne,
        referenceTransactionDeclaree: paiement.referenceTransaction,
        dateTransactionDeclaree: paiement.dateTransaction,
        modeDeclare: paiement.mode,
        statut: paiement.statut,
      },
      mention,
      emettePar: administrateur?.nom ?? null,
    };

    const depot = gestionnaire.getRepository(PaymentDocumentEntity);
    const document = depot.create({
      numero,
      type,
      statut: DocumentStatus.VALIDE,
      paiement,
      contribuable: paiement.contribuable,
      emisPar: administrateur,
      montant: paiement.montant,
      devise: paiement.devise,
      emetteur,
      mention,
      instantane,
      emisLe: dateEmission,
    });
    return depot.save(document);
  }

  private vueDocument(document: PaymentDocumentEntity, detail = false) {
    const instantane = document.instantane;
    const obligation = (instantane.obligation ?? {}) as Record<string, unknown>;
    const paiement = (instantane.paiement ?? {}) as Record<string, unknown>;
    return {
      id: document.id,
      numero: document.numero,
      type: document.type,
      statut: document.statut,
      paiementId: document.paiement?.id,
      referencePaiement: document.paiement?.referenceInterne,
      contribuableId: document.contribuable?.id,
      montant: Number(document.montant),
      devise: document.devise,
      emetteur: document.emetteur,
      mention: document.mention,
      emisLe: document.emisLe,
      typeImpotNom: String(
        obligation.typeImpot ??
          document.paiement?.obligation?.typeImpot?.nom ??
          "Type d'impôt",
      ),
      periode: String(
        obligation.periode ?? document.paiement?.obligation?.periode ?? "—",
      ),
      referenceTransactionDeclaree: String(
        paiement.referenceTransactionDeclaree ?? "—",
      ),
      modeDeclare: String(paiement.modeDeclare ?? "—"),
      emisPar:
        typeof instantane.emettePar === "string"
          ? instantane.emettePar
          : undefined,
      lienPdf: `/documents/${document.id}/pdf`,
      ...(detail ? { instantane: document.instantane } : {}),
    };
  }

  private async genererPdf(document: PaymentDocumentEntity): Promise<Buffer> {
    const instantane = document.instantane;
    const contribuable = (instantane.contribuable ?? {}) as Record<
      string,
      unknown
    >;
    const obligation = (instantane.obligation ?? {}) as Record<string, unknown>;
    const paiement = (instantane.paiement ?? {}) as Record<string, unknown>;
    const parties: Buffer[] = [];
    return new Promise((resoudre, rejeter) => {
      const pdf = new PDFDocument({
        size: "A4",
        margin: 52,
        info: { Title: document.numero, Author: document.emetteur },
      });
      pdf.on("data", (partie: Buffer) => parties.push(partie));
      pdf.on("end", () => resoudre(Buffer.concat(parties)));
      pdf.on("error", rejeter);

      pdf
        .fillColor("#12243a")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(document.emetteur.toUpperCase());
      pdf.moveDown(2);
      const titre =
        document.type === PaymentDocumentType.ACCUSE_DECLARATION
          ? "ACCUSÉ DE RÉCEPTION DE DÉCLARATION"
          : "REÇU INTERNE SRE";
      pdf.fontSize(19).text(titre, { align: "left" });
      pdf.moveDown(0.5);
      pdf
        .fillColor("#52627a")
        .font("Helvetica")
        .fontSize(10)
        .text(`Document n° ${document.numero}`);
      pdf.text(
        `Émis le ${new Date(document.emisLe).toLocaleString("fr-FR", { timeZone: "Indian/Antananarivo" })} (heure d'Antananarivo)`,
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
        .text(`Nom / raison sociale : ${String(contribuable.nom ?? "—")}`);
      pdf.text(`NIF : ${String(contribuable.nif ?? "—")}`);
      pdf.text(`Courriel : ${String(contribuable.courriel ?? "—")}`);
      pdf.moveDown(1);

      pdf.font("Helvetica-Bold").fontSize(12).text("Déclaration associée");
      pdf.moveDown(0.4);
      pdf
        .font("Helvetica")
        .fontSize(10)
        .text(
          `Référence interne : ${document.paiement?.referenceInterne ?? "—"}`,
        );
      pdf.text(
        `Impôt / période : ${String(obligation.typeImpot ?? "—")} · ${String(obligation.periode ?? "—")}`,
      );
      pdf.text(
        `Référence d'obligation : ${String(obligation.referenceFiscale ?? "—")}`,
      );
      pdf.text(
        `Référence de transaction déclarée : ${String(paiement.referenceTransactionDeclaree ?? "—")}`,
      );
      pdf.text(`Mode déclaré : ${String(paiement.modeDeclare ?? "—")}`);
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
          `${new Intl.NumberFormat("fr-FR").format(Number(document.montant))} ${document.devise}`,
        );
      pdf.moveDown(1.1);

      const alerte =
        document.type === PaymentDocumentType.ACCUSE_DECLARATION
          ? "ACCUSÉ DE SOUMISSION — PAS UNE PREUVE DE PAIEMENT"
          : "REÇU INTERNE DE DÉCISION — PAS UNE PREUVE BANCAIRE";
      pdf.fillColor("#9a4d0b").font("Helvetica-Bold").fontSize(10).text(alerte);
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
