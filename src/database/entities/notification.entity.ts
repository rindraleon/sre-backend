import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ObligationEntity } from "./obligation.entity";
import { UserEntity } from "./user.entity";

/** Delivery status of the e-mail attached to a notification (independent from in-app). */
export enum NotificationEmailStatus {
  /** No e-mail transport configured: nothing was attempted, nothing is announced. */
  NON_CONFIGURE = "NON_CONFIGURE",
  PENDING = "EN_ATTENTE",
  SENT = "ENVOYE",
  /** Confirmed by the mail provider — never set without proof. */
  DELIVERED = "DELIVRE",
  FAILED = "ECHEC",
}

/** Persisted notification (in-app notification center & tracked e-mail notifications). */
@Entity({ name: "notifications" })
@Index("uq_notifications_cle_idempotence", ["idempotencyKey"], { unique: true })
@Index("idx_notifications_utilisateur_lue", ["user", "isRead"])
export class NotificationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "utilisateur_id" })
  user!: UserEntity;

  @ManyToOne(() => ObligationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "obligation_id" })
  obligation!: ObligationEntity | null;

  /** Administrator or actor behind a notification (traceability). */
  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "cree_par_id" })
  createdBy!: UserEntity | null;

  /** Ex. AVANT_7, JOUR_J, RETARD_1, CONTACT_PUBLIC, DECLARATION_PAIEMENT, ACCUSE_RECEPTION. */
  @Column({ name: "type_rappel", type: "varchar", length: 48 })
  reminderType!: string;

  @Column({
    name: "titre",
    type: "varchar",
    length: 160,
  })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({
    name: "lien",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  link!: string | null;

  @Column({
    name: "lue",
    type: "boolean",
    default: false,
  })
  isRead!: boolean;

  @Column({ name: "cle_idempotence", type: "varchar", length: 200 })
  idempotencyKey!: string;

  @Column({
    name: "statut_courriel",
    type: "enum",
    enum: NotificationEmailStatus,
    enumName: "statut_courriel_notification_enum",
    default: NotificationEmailStatus.PENDING,
  })
  emailStatus!: NotificationEmailStatus;

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
