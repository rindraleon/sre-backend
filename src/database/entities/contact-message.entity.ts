import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Delivery status of the e-mail notifying the administrators. */
export enum ContactEmailStatus {
  /** No e-mail transport configured: the message stays in the portal only. */
  NON_CONFIGURE = "NON_CONFIGURE",
  PENDING = "EN_ATTENTE",
  SENT = "ENVOYE",
  FAILED = "ECHEC",
}

/**
 * Message sent through the public contact form.
 * The portal is the system of record: the row is written first, so a message
 * is never lost, even when the SMTP transport is missing or broken. The
 * e-mail to the administrators is a best-effort notification on top of it.
 */
@Entity({ name: "messages_contact" })
@Index("idx_messages_contact_cree_le", ["createdAt"])
export class ContactMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "nom", type: "varchar", length: 120 })
  name!: string;

  @Column({ name: "courriel", type: "varchar", length: 254 })
  email!: string;

  @Column({ name: "sujet", type: "varchar", length: 140 })
  subject!: string;

  @Column({ type: "text" })
  message!: string;

  /** Marked as read by an administrator. */
  @Column({ name: "lue", type: "boolean", default: false })
  isRead!: boolean;

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

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;
}
