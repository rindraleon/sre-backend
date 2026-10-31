import { BadRequestException } from "@nestjs/common";
import { TaxPeriodicity } from "../database/enums";
import { TaxTypeEntity } from "../database/entities/tax-type.entity";

/** Bornes du montant déclarable par un contribuable (ariary entiers). */
export const MONTANT_MINIMUM = 1_000;
export const MONTANT_MAXIMUM = 1_000_000_000_000;

/** Une opération déclarée ne peut pas être antérieure à cette fenêtre. */
export const FENETRE_DECLARATION_JOURS = 365;

export interface FiscalPeriod {
  /** Libellé normalisé stocké dans `periode_fiscale`. */
  period: string;
  /** Bornes de la période (facultatives pour les impôts ponctuels). */
  start: string | null;
  end: string | null;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Valide et normalise la période fiscale déclarée selon la périodicité de la nature
 * d'impôt. Une nature mensuelle exige « AAAA-MM », trimestrielle « AAAA-Tn »,
 * annuelle « AAAA » ; une nature ponctuelle accepte un libellé libre (date de
 * l'opération par défaut).
 */
export function resolveFiscalPeriod(
  periodicity: TaxPeriodicity,
  rawPeriod: string | undefined,
  transactionDate: string,
): FiscalPeriod {
  const value = rawPeriod?.trim() ?? "";

  if (periodicity === TaxPeriodicity.ONE_OFF) {
    const label = value || transactionDate.slice(0, 10);
    return {
      period: label.slice(0, 40),
      start: transactionDate.slice(0, 10),
      end: transactionDate.slice(0, 10),
    };
  }

  if (!value) {
    throw new BadRequestException(
      "La période fiscale est requise pour cette nature d'impôt.",
    );
  }

  if (periodicity === TaxPeriodicity.MONTHLY) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
    if (!match) {
      throw new BadRequestException(
        "Période invalide : format attendu AAAA-MM (impôt mensuel).",
      );
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    return {
      period: `${year}-${pad(month)}`,
      start: toIsoDate(year, month, 1),
      end: toIsoDate(year, month, lastDayOfMonth(year, month - 1)),
    };
  }

  if (periodicity === TaxPeriodicity.QUARTERLY) {
    const match = /^(\d{4})-[TtQq]([1-4])$/.exec(value);
    if (!match) {
      throw new BadRequestException(
        "Période invalide : format attendu AAAA-T1 à AAAA-T4 (impôt trimestriel).",
      );
    }
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      period: `${year}-T${quarter}`,
      start: toIsoDate(year, startMonth, 1),
      end: toIsoDate(year, endMonth, lastDayOfMonth(year, endMonth - 1)),
    };
  }

  // ANNUELLE
  if (!/^\d{4}$/.test(value)) {
    throw new BadRequestException(
      "Période invalide : format attendu AAAA (impôt annuel).",
    );
  }
  const year = Number(value);
  return {
    period: String(year),
    start: toIsoDate(year, 1, 1),
    end: toIsoDate(year, 12, 31),
  };
}

/** Vérifie que la date de l'opération est plausible (ni future, ni trop ancienne). */
export function assertTransactionDate(transactionDate: string, now = new Date()) {
  const date = new Date(`${transactionDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Date de transaction invalide.");
  }
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (date.getTime() > tomorrow.getTime()) {
    throw new BadRequestException(
      "La date de l'opération ne peut pas être dans le futur.",
    );
  }
  const oldest = new Date(
    today.getTime() - FENETRE_DECLARATION_JOURS * 24 * 60 * 60 * 1000,
  );
  if (date.getTime() < oldest.getTime()) {
    throw new BadRequestException(
      `Une opération de plus de ${FENETRE_DECLARATION_JOURS} jours ne peut plus être déclarée en ligne.`,
    );
  }
  return transactionDate.slice(0, 10);
}

/** Contrôle du montant déclaré, y compris le montant de référence des impôts fixes. */
export function assertAmount(
  amount: number,
  taxType?: Pick<TaxTypeEntity, "amountMode" | "referenceAmount" | "name"> | null,
) {
  if (!Number.isInteger(amount)) {
    throw new BadRequestException(
      "Le montant doit être un nombre entier d'ariary.",
    );
  }
  if (amount < MONTANT_MINIMUM) {
    throw new BadRequestException(
      `Le montant minimum déclarable est de ${MONTANT_MINIMUM} MGA.`,
    );
  }
  if (amount > MONTANT_MAXIMUM) {
    throw new BadRequestException(
      "Le montant déclaré dépasse le plafond autorisé.",
    );
  }
  if (
    taxType?.amountMode === "FIXE" &&
    taxType.referenceAmount != null &&
    Number(taxType.referenceAmount) > 0 &&
    Number(taxType.referenceAmount) !== amount
  ) {
    throw new BadRequestException(
      `Le montant de cet impôt est fixé à ${Number(taxType.referenceAmount)} MGA.`,
    );
  }
  return amount;
}

/** Une nature d'impôt doit être active et applicable au type de contribuable. */
export function isTaxTypeApplicable(
  taxType: Pick<TaxTypeEntity, "isActive" | "applicableTaxpayers">,
  taxpayerType: string,
) {
  return (
    taxType.isActive &&
    (taxType.applicableTaxpayers === "TOUS" ||
      taxType.applicableTaxpayers === taxpayerType)
  );
}

/**
 * Référence interne lisible et non devinable : PAY-AAAA-XXXXXXXXXXXX.
 * (Le tiret bas et les caractères ambigus sont évités pour la saisie manuelle.)
 */
export function buildInternalReference(randomHex: string, year = new Date().getFullYear()) {
  return `PAY-${year}-${randomHex.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
