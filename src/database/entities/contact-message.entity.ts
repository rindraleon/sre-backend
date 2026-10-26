import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** Delivery status of the e-mail (admin notification, visitor acknowledgment, or admin reply). */
export enum ContactEmailStatus {
  /** No e-mail transport configured: the message stays in the portal only. */
  NON_CONFIGURE = "NON_CONFIGURE",
  PENDING = "EN_ATTENTE",
  SENT = "ENVOYE",
  FAILED = "ECHEC",
}

/** Processing status of a contact message in the administrator's inbox. */
export enum ContactMessageStatus {
  UNREAD = "NON_LU",
  READ = "LU",
  PENDING_REPLY = "EN_ATTENTE_REPONSE",
  REPLIED = "REPONDU",
}

/** Origin of the contact message. */
export enum ContactMessageSource {
  PUBLIC_SITE = "SITE_PUBLIC",
  CLIENT_PORTAL = "ESPACE_CLIENT",
}

export interface ContactReplyHistoryItem {
  id: string;
  sujet: string;
  message: string;
  reponduLe: string;
  reponduParId: string | null;
  reponduParNom: string;
  statutCourriel: ContactEmailStatus;
  erreurCourriel: string | null;
}

/** Message sent through the public contact form or client workspace. */
@Entity({ name: "messages_contact" })
@Index("idx_messages_contact_cree_le", ["createdAt"])
@Index("idx_messages_contact_statut", ["status"])
@Index("idx_messages_contact_empreinte", ["contentHash", "createdAt"])
export class ContactMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reference", type: "varchar", length: 40, nullable: true })
  reference!: string | null;

  @Column({ name: "nom", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "courriel", type: "varchar", length: 254 })
  email!: string;

  @Column({ name: "sujet", type: "varchar", length: 140 })
  subject!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({
    name: "source",
    type: "varchar",
    length: 24,
    default: ContactMessageSource.PUBLIC_SITE,
  })
  source!: ContactMessageSource;

  @Column({ name: "utilisateur_id", type: "uuid", nullable: true })
  senderUserId!: string | null;

  @Column({
    name: "statut",
    type: "enum",
    enum: ContactMessageStatus,
    enumName: "statut_message_contact_enum",
    default: ContactMessageStatus.UNREAD,
  })
  status!: ContactMessageStatus;

  /** Marked as read by an administrator (kept in sync with status !== NON_LU). */
  @Column({ name: "lue", type: "boolean", default: false })
  isRead!: boolean;

  @Column({ name: "lu_le", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @Column({
    name: "statut_courriel",
    type: "enum",
    enum: ContactEmailStatus,
    enumName: "statut_courriel_contact_enum",
    default: ContactEmailStatus.PENDING,
  })
  emailStatus!: ContactEmailStatus;

  @Column({ name: "tentatives_courriel", type: "int", default: 0 })
  emailAttempts!: number;

  /** Short technical reason, with no secret or personal data. */
  @Column({
    name: "derniere_erreur_courriel",
    type: "varchar",
    length: 300,
    nullable: true,
  })
  lastEmailError!: string | null;

  @Column({ name: "courriel_envoye_le", type: "timestamptz", nullable: true })
  emailSentAt!: Date | null;

  /** Delivery status of the automatic acknowledgment sent to the visitor/client. */
  @Column({
    name: "statut_accuse",
    type: "enum",
    enum: ContactEmailStatus,
    enumName: "statut_courriel_contact_enum",
    default: ContactEmailStatus.PENDING,
  })
  ackEmailStatus!: ContactEmailStatus;

  @Column({ name: "tentatives_accuse", type: "int", default: 0 })
  ackEmailAttempts!: number;

  @Column({
    name: "derniere_erreur_accuse",
    type: "varchar",
    length: 300,
    nullable: true,
  })
  lastAckEmailError!: string | null;

  @Column({ name: "accuse_envoye_le", type: "timestamptz", nullable: true })
  ackEmailSentAt!: Date | null;

  /** Direct reply from an administrator. */
  @Column({
    name: "sujet_reponse",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  replySubject!: string | null;

  @Column({ name: "message_reponse", type: "text", nullable: true })
  replyMessage!: string | null;

  @Column({ name: "repondu_le", type: "timestamptz", nullable: true })
  repliedAt!: Date | null;

  @Column({ name: "repondu_par_id", type: "uuid", nullable: true })
  repliedById!: string | null;

  @Column({
    name: "repondu_par_nom",
    type: "varchar",
    length: 160,
    nullable: true,
  })
  repliedByName!: string | null;

  @Column({
    name: "statut_courriel_reponse",
    type: "enum",
    enum: ContactEmailStatus,
    enumName: "statut_courriel_contact_enum",
    nullable: true,
  })
  replyEmailStatus!: ContactEmailStatus | null;

  @Column({ name: "tentatives_courriel_reponse", type: "int", default: 0 })
  replyEmailAttempts!: number;

  @Column({
    name: "derniere_erreur_courriel_reponse",
    type: "varchar",
    length: 300,
    nullable: true,
  })
  lastReplyEmailError!: string | null;

  @Column({
    name: "historique_reponses",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  replyHistory!: ContactReplyHistoryItem[];

  /** SHA-256 fingerprint of (email + subject + message) for duplicate detection. */
  @Column({
    name: "empreinte_contenu",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  contentHash!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
