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
  UNDER_REVIEW = "EN_VERIFICATION",
  CONFIRMED = "CONFIRME",
  REJECTED = "REJETE",
  CORRECTION_REQUESTED = "CORRECTION_DEMANDEE",
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
