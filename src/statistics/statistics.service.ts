import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import { DataSource } from "typeorm";
import { PaymentStatus } from "../database/enums";
import { SRE_REGION } from "../database/region";
import { PaymentFilters } from "../payments/payment-filters";
import { PaymentsService } from "../payments/payments.service";

export type Granularity = "jour" | "mois" | "trimestre" | "annee";

const GRANULARITY_EXPRESSION: Record<Granularity, string> = {
  jour: `to_char(p.date_transaction, 'YYYY-MM-DD')`,
  mois: `to_char(p.date_transaction, 'YYYY-MM')`,
  trimestre: `to_char(p.date_transaction, 'YYYY') || '-T' || to_char(p.date_transaction, 'Q')`,
  annee: `to_char(p.date_transaction, 'YYYY')`,
};

const FROM_CLAUSE = `
  FROM paiements p
  JOIN contribuables contribuable ON contribuable.id = p.contribuable_id
  LEFT JOIN types_impots type_impot ON type_impot.id = p.type_impot_id
`;

interface StatRow {
  [key: string]: string | number | null;
}

/**
 * Statistiques et rapports calculés directement sur les paiements enregistrés.
 * Aucune valeur simulée : les montants « confirmés » ne comptent que le statut
 * CONFIRME, tous les autres statuts restent exposés séparément.
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Construit la clause WHERE paramétrée correspondant aux filtres.
   * Les alias disponibles sont `p`, `contribuable` et `type_impot`.
   */
  private buildWhere(filters: PaymentFilters) {
    const clauses: string[] = ["contribuable.region = $1"];
    const parameters: unknown[] = [SRE_REGION];

    const add = (template: (index: number) => string, value: unknown) => {
      parameters.push(value);
      clauses.push(template(parameters.length));
    };

    if (filters.statuses?.length) {
      add(
        (index) => `p.statut = ANY($${index}::statut_paiement_enum[])`,
        filters.statuses,
      );
    }
    if (filters.taxpayerId) add((i) => `p.contribuable_id = $${i}`, filters.taxpayerId);
    if (filters.taxTypeId) add((i) => `p.type_impot_id = $${i}`, filters.taxTypeId);
    if (filters.period) add((i) => `p.periode_fiscale = $${i}`, filters.period);
    if (filters.from) add((i) => `p.date_transaction >= $${i}`, filters.from);
    if (filters.to) add((i) => `p.date_transaction <= $${i}`, filters.to);
    if (filters.amountMin !== undefined) add((i) => `p.montant >= $${i}`, filters.amountMin);
    if (filters.amountMax !== undefined) add((i) => `p.montant <= $${i}`, filters.amountMax);
    if (filters.search) {
      add(
        (i) =>
          `(p.reference_interne ILIKE $${i} OR p.reference_transaction ILIKE $${i} OR contribuable.nif ILIKE $${i} OR contribuable.stat ILIKE $${i} OR contribuable.raison_sociale ILIKE $${i} OR contribuable.nom ILIKE $${i} OR contribuable.courriel ILIKE $${i})`,
        `%${filters.search}%`,
      );
    }

    return { where: `WHERE ${clauses.join(" AND ")}`, parameters };
  }

  async getStatistics(filters: PaymentFilters, granularity: Granularity = "mois") {
    const { where, parameters } = this.buildWhere(filters);
    const query = <T = StatRow[]>(sql: string) =>
      this.dataSource.query<T>(sql, parameters);

    const kpiRows = await query(`
      SELECT
        COUNT(*)::int AS total_declarations,
        COALESCE(SUM(p.montant) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}'), 0)::bigint AS montant_confirme,
        COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}')::int AS nb_confirme,
        COALESCE(SUM(p.montant) FILTER (WHERE p.statut IN ('${PaymentStatus.PENDING}','${PaymentStatus.UNDER_REVIEW}')), 0)::bigint AS montant_en_attente,
        COUNT(*) FILTER (WHERE p.statut IN ('${PaymentStatus.PENDING}','${PaymentStatus.UNDER_REVIEW}'))::int AS nb_en_attente,
        COALESCE(SUM(p.montant) FILTER (WHERE p.statut IN ('${PaymentStatus.FAILED}','${PaymentStatus.REJECTED}','${PaymentStatus.CANCELLED}')), 0)::bigint AS montant_non_abouti,
        COUNT(*) FILTER (WHERE p.statut IN ('${PaymentStatus.FAILED}','${PaymentStatus.REJECTED}','${PaymentStatus.CANCELLED}'))::int AS nb_non_abouti,
        COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.FAILED}')::int AS nb_echec,
        COALESCE(SUM(p.montant), 0)::bigint AS montant_declare_total,
        COUNT(DISTINCT p.contribuable_id) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}')::int AS nb_contribuables_payeurs
      ${FROM_CLAUSE}
      ${where}
    `);
    const kpi = (kpiRows as StatRow[])[0] ?? {};

    const parImpot = (await query(`
      SELECT COALESCE(type_impot.nom, 'Non précisé') AS nature,
             COUNT(*)::int AS declarations,
             COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}')::int AS confirmes,
             COALESCE(SUM(p.montant) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}'), 0)::bigint AS montant_confirme
      ${FROM_CLAUSE}
      ${where}
      GROUP BY type_impot.nom
      ORDER BY montant_confirme DESC, declarations DESC
    `)) as StatRow[];

    const parStatut = (await query(`
      SELECT p.statut AS statut,
             COUNT(*)::int AS declarations,
             COALESCE(SUM(p.montant), 0)::bigint AS montant
      ${FROM_CLAUSE}
      ${where}
      GROUP BY p.statut
      ORDER BY declarations DESC
    `)) as StatRow[];

    const evolution = (await query(`
      SELECT ${GRANULARITY_EXPRESSION[granularity]} AS periode,
             COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}')::int AS confirmes,
             COALESCE(SUM(p.montant) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}'), 0)::bigint AS montant_confirme,
             COUNT(*)::int AS declarations
      ${FROM_CLAUSE}
      ${where}
      GROUP BY periode
      ORDER BY periode ASC
    `)) as StatRow[];

    const topContribuables = (await query(`
      SELECT contribuable.id AS id,
             COALESCE(NULLIF(contribuable.raison_sociale, ''), CONCAT_WS(' ', contribuable.prenom, contribuable.nom)) AS nom,
             contribuable.nif AS nif,
             contribuable.type AS type,
             COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}')::int AS paiements_confirmes,
             COALESCE(SUM(p.montant) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}'), 0)::bigint AS montant_confirme
      ${FROM_CLAUSE}
      ${where}
      GROUP BY contribuable.id, contribuable.raison_sociale, contribuable.nom, contribuable.prenom, contribuable.nif, contribuable.type
      HAVING COUNT(*) FILTER (WHERE p.statut = '${PaymentStatus.CONFIRMED}') > 0
      ORDER BY montant_confirme DESC
      LIMIT 10
    `)) as StatRow[];

    const repartitionPayeurs = (await query(`
      SELECT contribuable.type AS type,
             COUNT(DISTINCT contribuable.id)::int AS contribuables
      ${FROM_CLAUSE}
      ${where} AND p.statut = '${PaymentStatus.CONFIRMED}'
      GROUP BY contribuable.type
    `)) as StatRow[];

    const suivi = (await query(`
      SELECT p.id, p.reference_interne, p.statut, p.montant, p.date_transaction,
             COALESCE(NULLIF(contribuable.raison_sociale, ''), CONCAT_WS(' ', contribuable.prenom, contribuable.nom)) AS contribuable,
             type_impot.nom AS nature
      ${FROM_CLAUSE}
      ${where} AND p.statut IN ('${PaymentStatus.PENDING}','${PaymentStatus.UNDER_REVIEW}','${PaymentStatus.FAILED}','${PaymentStatus.REJECTED}')
      ORDER BY p.soumis_le DESC
      LIMIT 10
    `)) as StatRow[];

    return {
      perimetre: SRE_REGION,
      granularite: granularity,
      genereLe: new Date().toISOString(),
      indicateurs: {
        totalDeclarations: Number(kpi.total_declarations ?? 0),
        montantConfirme: Number(kpi.montant_confirme ?? 0),
        nombrePaiementsConfirmes: Number(kpi.nb_confirme ?? 0),
        montantEnAttente: Number(kpi.montant_en_attente ?? 0),
        nombreEnAttente: Number(kpi.nb_en_attente ?? 0),
        montantNonAbouti: Number(kpi.montant_non_abouti ?? 0),
        nombreNonAbouti: Number(kpi.nb_non_abouti ?? 0),
        nombreEchecs: Number(kpi.nb_echec ?? 0),
        montantDeclareTotal: Number(kpi.montant_declare_total ?? 0),
        nombreContribuablesPayeurs: Number(kpi.nb_contribuables_payeurs ?? 0),
      },
      devise: "MGA",
      parNatureImpot: parImpot.map((row) => ({
        nature: String(row.nature ?? "Non précisé"),
        declarations: Number(row.declarations ?? 0),
        confirmes: Number(row.confirmes ?? 0),
        montantConfirme: Number(row.montant_confirme ?? 0),
      })),
      parStatut: parStatut.map((row) => ({
        statut: String(row.statut),
        declarations: Number(row.declarations ?? 0),
        montant: Number(row.montant ?? 0),
      })),
      evolution: evolution.map((row) => ({
        periode: String(row.periode ?? "—"),
        declarations: Number(row.declarations ?? 0),
        confirmes: Number(row.confirmes ?? 0),
        montantConfirme: Number(row.montant_confirme ?? 0),
      })),
      principauxContribuables: topContribuables.map((row) => ({
        id: String(row.id),
        nom: String(row.nom ?? "—"),
        nif: (row.nif as string | null) ?? null,
        type: String(row.type ?? ""),
        paiementsConfirmes: Number(row.paiements_confirmes ?? 0),
        montantConfirme: Number(row.montant_confirme ?? 0),
      })),
      repartitionPayeurs: repartitionPayeurs.map((row) => ({
        type: String(row.type ?? ""),
        contribuables: Number(row.contribuables ?? 0),
      })),
      aSuivre: suivi.map((row) => ({
        id: String(row.id),
        referenceInterne: String(row.reference_interne ?? ""),
        statut: String(row.statut ?? ""),
        montant: Number(row.montant ?? 0),
        dateTransaction: String(row.date_transaction ?? ""),
        contribuable: String(row.contribuable ?? "—"),
        nature: (row.nature as string | null) ?? null,
      })),
    };
  }

  /** Export CSV des paiements filtrés (séparateur « ; », BOM UTF-8 pour Excel). */
  async exportCsv(filters: PaymentFilters) {
    const rows: string[][] = [
      [
        "Reference interne",
        "Date transaction",
        "Contribuable",
        "NIF",
        "Nature impot",
        "Periode fiscale",
        "Montant",
        "Devise",
        "Mode",
        "Statut",
        "Confirme le",
        "Reference transaction",
        "Recu",
      ],
    ];

    const collect = (items: Awaited<ReturnType<PaymentsService["listForAdministration"]>>["donnees"]) => {
      for (const item of items) {
        rows.push([
          item.referenceInterne,
          item.dateTransaction,
          item.contribuable?.raisonSociale ||
            [item.contribuable?.prenom, item.contribuable?.nom]
              .filter(Boolean)
              .join(" "),
          item.contribuable?.nif ?? "",
          item.typeImpotNom ?? "",
          item.periode ?? "",
          String(item.montant),
          item.devise,
          item.mode,
          item.statut,
          item.confirmeLe ? new Date(item.confirmeLe).toISOString() : "",
          item.referenceTransaction,
          item.recu?.numero ?? "",
        ]);
      }
    };

    const first = await this.payments.listForAdministration({ ...filters, page: 1, perPage: 100 });
    collect(first.donnees);
    for (let index = 2; index <= first.pages; index += 1) {
      const next = await this.payments.listForAdministration({ ...filters, page: index, perPage: 100 });
      collect(next.donnees);
    }

    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const content = "\uFEFF" + rows.map((row) => row.map(escape).join(";")).join("\r\n");
    return {
      filename: `paiements-sre-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
    };
  }

  /** Export PDF : synthèse chiffrée + tableau des paiements filtrés. */
  async exportPdf(filters: PaymentFilters) {
    const stats = await this.getStatistics(filters, "mois");
    const rows = [] as Awaited<ReturnType<PaymentsService["listForAdministration"]>>["donnees"];
    const first = await this.payments.listForAdministration({ ...filters, page: 1, perPage: 100 });
    rows.push(...first.donnees);
    for (let index = 2; index <= first.pages && rows.length < 500; index += 1) {
      const next = await this.payments.listForAdministration({ ...filters, page: index, perPage: 100 });
      rows.push(...next.donnees);
    }

    const content = await new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      const pdf = new PDFDocument({ size: "A4", margin: 40, layout: "landscape" });
      pdf.on("data", (part: Buffer) => parts.push(part));
      pdf.on("end", () => resolve(Buffer.concat(parts)));
      pdf.on("error", reject);

      const money = (value: number) =>
        `${new Intl.NumberFormat("fr-FR").format(value)} MGA`;

      pdf.fillColor("#12243a").font("Helvetica-Bold").fontSize(16).text("Rapport des paiements — SRE");
      pdf.moveDown(0.3);
      pdf
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#52627a")
        .text(
          `Périmètre : ${stats.perimetre} · Généré le ${new Date().toLocaleString("fr-FR")} · ${first.total} paiement(s) filtré(s)`,
        );
      pdf.moveDown(0.8);

      pdf.fillColor("#12243a").font("Helvetica-Bold").fontSize(11).text("Indicateurs");
      pdf.moveDown(0.3);
      pdf.font("Helvetica").fontSize(9);
      const lines: [string, string][] = [
        ["Déclarations enregistrées", String(stats.indicateurs.totalDeclarations)],
        ["Montant confirmé (encaissé)", money(stats.indicateurs.montantConfirme)],
        ["Paiements confirmés", String(stats.indicateurs.nombrePaiementsConfirmes)],
        ["Montant en attente de confirmation", money(stats.indicateurs.montantEnAttente)],
        ["Montant non abouti (échec, rejet, annulation)", money(stats.indicateurs.montantNonAbouti)],
        ["Contribuables ayant payé", String(stats.indicateurs.nombreContribuablesPayeurs)],
      ];
      for (const [label, value] of lines) pdf.text(`${label} : ${value}`);
      pdf.moveDown(0.8);

      pdf.fillColor("#12243a").font("Helvetica-Bold").fontSize(11).text("Paiements filtrés");
      pdf.moveDown(0.4);

      const columns = [
        { label: "Référence", width: 130 },
        { label: "Date", width: 62 },
        { label: "Contribuable", width: 150 },
        { label: "Nature", width: 110 },
        { label: "Période", width: 62 },
        { label: "Montant", width: 80 },
        { label: "Statut", width: 78 },
        { label: "Reçu", width: 120 },
      ];
      const header = () => {
        let x = 40;
        pdf.font("Helvetica-Bold").fontSize(8).fillColor("#12243a");
        const y = pdf.y;
        for (const column of columns) {
          pdf.text(column.label, x, y, { width: column.width - 4 });
          x += column.width;
        }
        pdf.y = y + 14;
        pdf.font("Helvetica").fontSize(8).fillColor("#334155");
      };
      header();

      for (const payment of rows) {
        if (pdf.y > 540) {
          pdf.addPage({ layout: "landscape" });
          header();
        }
        const values = [
          payment.referenceInterne,
          payment.dateTransaction,
          (
            payment.contribuable?.raisonSociale ||
            [payment.contribuable?.prenom, payment.contribuable?.nom]
              .filter(Boolean)
              .join(" ")
          ).slice(0, 34),
          (payment.typeImpotNom ?? "").slice(0, 26),
          payment.periode ?? "—",
          new Intl.NumberFormat("fr-FR").format(payment.montant),
          payment.statut,
          payment.recu?.numero ?? "—",
        ];
        const y = pdf.y;
        let x = 40;
        values.forEach((value, index) => {
          pdf.text(String(value), x, y, { width: columns[index].width - 4 });
          x += columns[index].width;
        });
        pdf.y = y + 13;
      }

      pdf
        .moveDown(0.6)
        .fillColor("#718096")
        .fontSize(7)
        .text(
          "Les montants confirmés correspondent uniquement aux paiements dont la réussite a été confirmée par le mécanisme de paiement.",
          { width: 700 },
        );
      pdf.end();
    });

    return {
      filename: `rapport-paiements-sre-${new Date().toISOString().slice(0, 10)}.pdf`,
      content,
    };
  }
}
