export enum AccountRole {
  ADMIN = "ADMIN",
  CLIENT = "CLIENT",
}

export enum AccountStatus {
  ACTIF = "ACTIF",
  EN_ATTENTE = "EN_ATTENTE",
  INACTIF = "INACTIF",
  SUSPENDU = "SUSPENDU",
}

export enum TaxpayerType {
  PARTICULIER = "PARTICULIER",
  ENTREPRISE = "ENTREPRISE",
}

export enum ObligationStatus {
  A_PAYER = "A_PAYER",
  PAIEMENT_EN_COURS = "PAIEMENT_EN_COURS",
  EN_VERIFICATION = "EN_VERIFICATION",
  PAYE = "PAYE",
  EN_RETARD = "EN_RETARD",
  REJETE = "REJETE",
  CORRECTION_DEMANDEE = "CORRECTION_DEMANDEE",
}

export enum PaymentStatus {
  EN_VERIFICATION = "EN_VERIFICATION",
  CONFIRME = "CONFIRME",
  REJETE = "REJETE",
  CORRECTION_DEMANDEE = "CORRECTION_DEMANDEE",
}

export enum PaymentMethod {
  MOBILE_MONEY = "MOBILE_MONEY",
  VIREMENT_BANCAIRE = "VIREMENT_BANCAIRE",
}

export enum PaymentOperator {
  MVOLA = "MVOLA",
  ORANGE_MONEY = "ORANGE_MONEY",
  AIRTEL_MONEY = "AIRTEL_MONEY",
}

export enum PaymentDocumentType {
  ACCUSE_DECLARATION = "ACCUSE_DECLARATION",
  RECU_PAIEMENT = "RECU_PAIEMENT",
}

export enum DocumentStatus {
  VALIDE = "VALIDE",
  ANNULE = "ANNULE",
}

export enum TaxPeriodicity {
  MENSUELLE = "MENSUELLE",
  TRIMESTRIELLE = "TRIMESTRIELLE",
  ANNUELLE = "ANNUELLE",
  PONCTUELLE = "PONCTUELLE",
}

/** Type de jeton sécurisé à usage limité (empreinte SHA-256 stockée). */
export enum ActivationTokenType {
  /** Première connexion d'un compte créé par import (parcours d'activation). */
  ACTIVATION = "ACTIVATION",
  /** Réinitialisation sécurisée du mot de passe. */
  REINITIALISATION = "REINITIALISATION",
}

/** Statut d'envoi d'un courriel d'activation / première connexion. */
export enum ActivationEmailStatus {
  EN_ATTENTE = "EN_ATTENTE",
  ENVOYEE = "ENVOYEE",
  ECHEC = "ECHEC",
}
