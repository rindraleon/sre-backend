import { NotificationEntity } from "../../database/entities/notification.entity";
import { ObligationEntity } from "../../database/entities/obligation.entity";
import { TaxTypeEntity } from "../../database/entities/tax-type.entity";
import { TaxpayerEntity } from "../../database/entities/taxpayer.entity";
import { UserEntity } from "../../database/entities/user.entity";

/** Wire-compatibility views. */

export interface TaxTypeView {
  id: string;
  code: string;
  nom: string;
  description: string;
  categorie: string;
  contribuablesConcernes: TaxTypeEntity["applicableTaxpayers"];
  periodicite: TaxTypeEntity["periodicity"];
  regleEcheance: string;
  modeMontant: TaxTypeEntity["amountMode"];
  montantReference: string | null;
  champsComplementaires: string[];
  actif: boolean;
  creeLe: Date;
  modifieLe: Date;
}

export interface UserEntityView {
  id: string;
  nom: string;
  courriel: string;
  motDePasseHash: string;
  role: UserEntity["role"];
  statut: UserEntity["status"];
  changementMotDePasseRequis: boolean;
  profilComplete: boolean;
  derniereConnexion: Date | null;
  courrielVerifie: boolean;
  verificationCourrielCodeHash: string | null;
  verificationCourrielExpireLe: Date | null;
  contribuable?: TaxpayerEntityView | undefined;
  creeLe: Date;
  modifieLe: Date;
}

export interface TaxpayerEntityView {
  id: string;
  utilisateur?: UserEntityView | null | undefined;
  type: TaxpayerEntity["type"];
  nom: string;
  prenom: string | null;
  raisonSociale: string | null;
  nomCommercial: string | null;
  nif: string | null;
  stat: string | null;
  adresse: string;
  region: string;
  ville: string;
  courriel: string;
  telephone: string;
  representantLegal: string | null;
  nomContact: string | null;
  prenomContact: string | null;
  fonctionContact: string | null;
  dateCreationCompte: Date;
  creeLe: Date;
  modifieLe: Date;
}

export interface ObligationEntityView {
  id: string;
  contribuable?: TaxpayerEntityView;
  typeImpot?: TaxTypeView;
  referenceFiscale: string;
  periode: string;
  montant: string;
  devise: ObligationEntity["currency"];
  echeance: string;
  statut: ObligationEntity["status"];
  creeLe: Date;
  modifieLe: Date;
}

export interface NotificationView {
  id: string;
  utilisateur?: UserEntityView;
  obligation?: ObligationEntityView | null;
  creePar?: UserEntityView | null;
  typeRappel: string;
  titre: string;
  message: string;
  lien: string | null;
  lue: boolean;
  cleIdempotence: string;
  statutCourriel: NotificationEntity["emailStatus"];
  tentativesCourriel: number;
  derniereErreurCourriel: string | null;
  courrielEnvoyeLe: Date | null;
  creeLe: Date;
}

export function toTaxTypeView(taxType: TaxTypeEntity): TaxTypeView {
  return {
    id: taxType.id,
    code: taxType.code,
    nom: taxType.name,
    description: taxType.description,
    categorie: taxType.category,
    contribuablesConcernes: taxType.applicableTaxpayers,
    periodicite: taxType.periodicity,
    regleEcheance: taxType.dueDateRule,
    modeMontant: taxType.amountMode,
    montantReference: taxType.referenceAmount,
    champsComplementaires: taxType.additionalFields,
    actif: taxType.isActive,
    creeLe: taxType.createdAt,
    modifieLe: taxType.updatedAt,
  };
}

export function toUserEntityView(user: UserEntity): UserEntityView {
  return {
    id: user.id,
    nom: user.name,
    courriel: user.email,
    motDePasseHash: user.passwordHash,
    role: user.role,
    statut: user.status,
    changementMotDePasseRequis: user.mustChangePassword,
    profilComplete: user.isProfileComplete,
    derniereConnexion: user.lastLoginAt,
    courrielVerifie: user.isEmailVerified,
    verificationCourrielCodeHash: user.emailVerificationCodeHash,
    verificationCourrielExpireLe: user.emailVerificationExpiresAt,
    ...("taxpayer" in user
      ? {
          contribuable:
            user.taxpayer === undefined || user.taxpayer === null
              ? user.taxpayer
              : toTaxpayerEntityView(user.taxpayer),
        }
      : {}),
    creeLe: user.createdAt,
    modifieLe: user.updatedAt,
  };
}

export function toTaxpayerEntityView(taxpayer: TaxpayerEntity): TaxpayerEntityView {
  return {
    id: taxpayer.id,
    ...("user" in taxpayer
      ? {
          utilisateur:
            taxpayer.user === undefined || taxpayer.user === null
              ? taxpayer.user
              : toUserEntityView(taxpayer.user),
        }
      : {}),
    type: taxpayer.type,
    nom: taxpayer.lastName,
    prenom: taxpayer.firstName,
    raisonSociale: taxpayer.legalName,
    nomCommercial: taxpayer.tradeName,
    nif: taxpayer.nif,
    stat: taxpayer.stat,
    adresse: taxpayer.address,
    region: taxpayer.region,
    ville: taxpayer.city,
    courriel: taxpayer.email,
    telephone: taxpayer.phone,
    representantLegal: taxpayer.legalRepresentative,
    nomContact: taxpayer.contactLastName,
    prenomContact: taxpayer.contactFirstName,
    fonctionContact: taxpayer.contactRole,
    dateCreationCompte: taxpayer.accountCreatedAt,
    creeLe: taxpayer.createdAt,
    modifieLe: taxpayer.updatedAt,
  };
}

export function toObligationEntityView(obligation: ObligationEntity): ObligationEntityView {
  return {
    id: obligation.id,
    ...("taxpayer" in obligation &&
    obligation.taxpayer !== undefined &&
    obligation.taxpayer !== null
      ? { contribuable: toTaxpayerEntityView(obligation.taxpayer) }
      : {}),
    ...("taxType" in obligation &&
    obligation.taxType !== undefined &&
    obligation.taxType !== null
      ? { typeImpot: toTaxTypeView(obligation.taxType) }
      : {}),
    referenceFiscale: obligation.taxReference,
    periode: obligation.period,
    montant: obligation.amount,
    devise: obligation.currency,
    echeance: obligation.dueDate,
    statut: obligation.status,
    creeLe: obligation.createdAt,
    modifieLe: obligation.updatedAt,
  };
}

export function toNotificationView(notification: NotificationEntity): NotificationView {
  return {
    id: notification.id,
    ...("user" in notification
      ? {
          utilisateur:
            notification.user === undefined || notification.user === null
              ? undefined
              : toUserEntityView(notification.user),
        }
      : {}),
    ...("obligation" in notification
      ? {
          obligation:
            notification.obligation === undefined ||
            notification.obligation === null
              ? null
              : toObligationEntityView(notification.obligation),
        }
      : {}),
    ...("createdBy" in notification
      ? {
          creePar:
            notification.createdBy === undefined ||
            notification.createdBy === null
              ? null
              : toUserEntityView(notification.createdBy),
        }
      : {}),
    typeRappel: notification.reminderType,
    titre: notification.title,
    message: notification.message,
    lien: notification.link,
    lue: notification.isRead,
    cleIdempotence: notification.idempotencyKey,
    statutCourriel: notification.emailStatus,
    tentativesCourriel: notification.emailAttempts,
    derniereErreurCourriel: notification.lastEmailError,
    courrielEnvoyeLe: notification.emailSentAt,
    creeLe: notification.createdAt,
  };
}
