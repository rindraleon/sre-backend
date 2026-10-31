export enum AccountRole {
  ADMIN = "ADMIN",
  CLIENT = "CLIENT",
}

export enum AccountStatus {
  ACTIVE = "ACTIF",
  PENDING = "EN_ATTENTE",
  INACTIVE = "INACTIF",
  SUSPENDED = "SUSPENDU",
}

export enum TaxpayerType {
  INDIVIDUAL = "PARTICULIER",
  BUSINESS = "ENTREPRISE",
}

export enum ObligationStatus {
  TO_PAY = "A_PAYER",
  PAYMENT_IN_PROGRESS = "PAIEMENT_EN_COURS",
  UNDER_REVIEW = "EN_VERIFICATION",
  PAID = "PAYE",
  OVERDUE = "EN_RETARD",
  REJECTED = "REJETE",
  CORRECTION_REQUESTED = "CORRECTION_DEMANDEE",
}

export enum PaymentStatus {
  /** Déclaration autonome déposée, en attente de la confirmation du paiement. */
  PENDING = "EN_ATTENTE",
  /** Déclaration historique soumise à l'examen administratif (compatibilité). */
  UNDER_REVIEW = "EN_VERIFICATION",
  /** Paiement confirmé par le mécanisme de paiement : le reçu est généré automatiquement. */
  CONFIRMED = "CONFIRME",
  REJECTED = "REJETE",
  CORRECTION_REQUESTED = "CORRECTION_DEMANDEE",
  /** Le mécanisme de paiement a signalé un échec. */
  FAILED = "ECHEC",
  /** Paiement annulé par le contribuable ou par le service avant confirmation. */
  CANCELLED = "ANNULE",
}

/** Statuts pour lesquels un paiement est encore susceptible d'être confirmé. */
export const PAYMENT_OPEN_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.UNDER_REVIEW,
];

/** Statuts qui n'autorisent ni confirmation ni génération de reçu. */
export const PAYMENT_TERMINAL_NON_CONFIRMED_STATUSES: PaymentStatus[] = [
  PaymentStatus.REJECTED,
  PaymentStatus.CANCELLED,
  PaymentStatus.FAILED,
];

/** Origine de la déclaration de paiement. */
export enum PaymentOrigin {
  /** Saisie par le contribuable lui-même : montant, impôt et période libres. */
  AUTONOMOUS = "DECLARATION_AUTONOME",
  /** Déclaration rattachée à une obligation fiscale créée par l'administration. */
  OBLIGATION = "OBLIGATION",
}

export enum PaymentMethod {
  MOBILE_MONEY = "MOBILE_MONEY",
  BANK_TRANSFER = "VIREMENT_BANCAIRE",
}

export enum PaymentOperator {
  MVOLA = "MVOLA",
  ORANGE_MONEY = "ORANGE_MONEY",
  AIRTEL_MONEY = "AIRTEL_MONEY",
}

export enum PaymentDocumentType {
  DECLARATION_ACKNOWLEDGMENT = "ACCUSE_DECLARATION",
  PAYMENT_RECEIPT = "RECU_PAIEMENT",
}

export enum DocumentStatus {
  VALID = "VALIDE",
  CANCELLED = "ANNULE",
}

export enum TaxPeriodicity {
  MONTHLY = "MENSUELLE",
  QUARTERLY = "TRIMESTRIELLE",
  YEARLY = "ANNUELLE",
  ONE_OFF = "PONCTUELLE",
}

/** Secure single-purpose token type (SHA-256 fingerprint stored). */
export enum ActivationTokenType {
  /** First sign-in of an account created by import (activation flow). */
  ACTIVATION = "ACTIVATION",
  /** Secure password reset. */
  PASSWORD_RESET = "REINITIALISATION",
}

/** Delivery status of an activation / first-sign-in e-mail. */
export enum ActivationEmailStatus {
  PENDING = "EN_ATTENTE",
  SENT = "ENVOYEE",
  FAILED = "ECHEC",
}
