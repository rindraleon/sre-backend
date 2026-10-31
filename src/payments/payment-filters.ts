import { BadRequestException } from "@nestjs/common";
import { ObjectLiteral, SelectQueryBuilder } from "typeorm";
import { PaymentStatus } from "../database/enums";
import { SRE_REGION } from "../database/region";

export type PaymentSort =
  | "date_desc"
  | "date_asc"
  | "montant_desc"
  | "montant_asc"
  | "confirmation_desc";

export interface PaymentFilters {
  statuses?: PaymentStatus[];
  taxpayerId?: string;
  taxTypeId?: string;
  period?: string;
  from?: string;
  to?: string;
  amountMin?: number;
  amountMax?: number;
  search?: string;
  sort?: PaymentSort;
  page?: number;
  perPage?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SORTS: PaymentSort[] = [
  "date_desc",
  "date_asc",
  "montant_desc",
  "montant_asc",
  "confirmation_desc",
];

function parseDate(value: string | undefined, label: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!ISO_DATE.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
    throw new BadRequestException(
      `${label} invalide : format attendu AAAA-MM-JJ.`,
    );
  }
  return trimmed;
}

function parseAmount(value: string | undefined, label: string) {
  if (value === undefined || value.trim() === "") return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new BadRequestException(`${label} invalide.`);
  }
  return Math.floor(amount);
}

/** Convertit les paramètres de requête HTTP en filtres validés. */
export function parsePaymentFilters(query: {
  statut?: string;
  statuts?: string;
  contribuableId?: string;
  typeImpotId?: string;
  periode?: string;
  du?: string;
  au?: string;
  montantMin?: string;
  montantMax?: string;
  recherche?: string;
  tri?: string;
  page?: string;
  parPage?: string;
}): PaymentFilters {
  const statuses: PaymentStatus[] = [];
  const rawStatuses = [query.statut, query.statuts]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  for (const value of rawStatuses) {
    if (!Object.values(PaymentStatus).includes(value as PaymentStatus)) {
      throw new BadRequestException(`Statut de paiement inconnu : ${value}.`);
    }
    if (!statuses.includes(value as PaymentStatus)) {
      statuses.push(value as PaymentStatus);
    }
  }

  const from = parseDate(query.du, "Date de début");
  const to = parseDate(query.au, "Date de fin");
  if (from && to && from > to) {
    throw new BadRequestException(
      "La date de début doit précéder la date de fin.",
    );
  }

  const amountMin = parseAmount(query.montantMin, "Montant minimum");
  const amountMax = parseAmount(query.montantMax, "Montant maximum");
  if (amountMin !== undefined && amountMax !== undefined && amountMin > amountMax) {
    throw new BadRequestException(
      "Le montant minimum doit être inférieur au montant maximum.",
    );
  }

  let sort: PaymentSort | undefined;
  if (query.tri) {
    if (!SORTS.includes(query.tri as PaymentSort)) {
      throw new BadRequestException("Tri demandé inconnu.");
    }
    sort = query.tri as PaymentSort;
  }

  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const perPage = Math.min(
    100,
    Math.max(1, Math.floor(Number(query.parPage) || 25)),
  );

  return {
    ...(statuses.length ? { statuses } : {}),
    ...(query.contribuableId ? { taxpayerId: query.contribuableId.trim() } : {}),
    ...(query.typeImpotId ? { taxTypeId: query.typeImpotId.trim() } : {}),
    ...(query.periode ? { period: query.periode.trim() } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(amountMin !== undefined ? { amountMin } : {}),
    ...(amountMax !== undefined ? { amountMax } : {}),
    ...(query.recherche?.trim() ? { search: query.recherche.trim() } : {}),
    ...(sort ? { sort } : {}),
    page,
    perPage,
  };
}

/**
 * Applique les filtres multicritères sur un QueryBuilder de paiements.
 * Les alias `payment`, `taxpayer`, `obligation`, `taxType` doivent être joints par l'appelant.
 */
export function applyPaymentFilters<T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  filters: PaymentFilters,
  options: { regionColumn?: string; searchColumns?: string[] } = {},
) {
  const regionColumn = options.regionColumn ?? "taxpayer.region";
  if (regionColumn) {
    builder.andWhere(`${regionColumn} = :regionFiltre`, {
      regionFiltre: SRE_REGION,
    });
  }
  if (filters.statuses?.length) {
    builder.andWhere("payment.status IN (:...statusesFiltre)", {
      statusesFiltre: filters.statuses,
    });
  }
  if (filters.taxpayerId) {
    builder.andWhere("taxpayer.id = :taxpayerFiltre", {
      taxpayerFiltre: filters.taxpayerId,
    });
  }
  if (filters.taxTypeId) {
    builder.andWhere("taxType.id = :taxTypeFiltre", {
      taxTypeFiltre: filters.taxTypeId,
    });
  }
  if (filters.period) {
    builder.andWhere("payment.fiscalPeriod = :periodeFiltre", {
      periodeFiltre: filters.period,
    });
  }
  if (filters.from) {
    builder.andWhere("payment.transactionDate >= :dateDebut", {
      dateDebut: filters.from,
    });
  }
  if (filters.to) {
    builder.andWhere("payment.transactionDate <= :dateFin", {
      dateFin: filters.to,
    });
  }
  if (filters.amountMin !== undefined) {
    builder.andWhere("payment.amount >= :montantMinFiltre", {
      montantMinFiltre: filters.amountMin,
    });
  }
  if (filters.amountMax !== undefined) {
    builder.andWhere("payment.amount <= :montantMaxFiltre", {
      montantMaxFiltre: filters.amountMax,
    });
  }
  if (filters.search) {
    const columns = options.searchColumns ?? [
      "payment.internalReference",
      "payment.transactionReference",
      "taxpayer.legalName",
      "taxpayer.lastName",
      "taxpayer.firstName",
      "taxpayer.nif",
      "taxpayer.stat",
      "taxpayer.email",
    ];
    builder.andWhere(
      `(${columns.map((column) => `${column} ILIKE :rechercheFiltre`).join(" OR ")})`,
      { rechercheFiltre: `%${filters.search}%` },
    );
  }
  return builder;
}

/** Ordre de tri demandé, par défaut le plus récent d'abord. */
export function applyPaymentSort<T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  sort: PaymentSort | undefined,
) {
  switch (sort) {
    case "date_asc":
      return builder.orderBy("payment.submittedAt", "ASC");
    case "montant_desc":
      return builder.orderBy("payment.amount", "DESC");
    case "montant_asc":
      return builder.orderBy("payment.amount", "ASC");
    case "confirmation_desc":
      return builder
        .orderBy("payment.confirmedAt", "DESC", "NULLS LAST")
        .addOrderBy("payment.submittedAt", "DESC");
    default:
      return builder.orderBy("payment.submittedAt", "DESC");
  }
}
