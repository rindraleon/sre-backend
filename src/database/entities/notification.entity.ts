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

/** État d'envoi du courriel associé à une notification (indépendant de l'in-app). */
export enum NotificationEmailStatus {
  /** Aucun transport e-mail configuré : rien n'a été tenté, rien n'est annoncé. */
  NON_CONFIGURE = "NON_CONFIGURE",
  EN_ATTENTE = "EN_ATTENTE",
  ENVOYE = "ENVOYE",
  ECHEC = "ECHEC",
}

/**
 * Notification persistée (centre de notifications in-app).
 * `cleIdempotence` unique = utilisateur + obligation + type de rappel :
 * le job de rappels peut être relancé (ou exécuté en double instance) sans
 * jamais créer deux notifications du même type pour la même obligation.
 */
@Entity({ name: "notifications" })
@Index("uq_notifications_cle_idempotence", ["cleIdempotence"], { unique: true })
@Index("idx_notifications_utilisateur_lue", ["utilisateur", "lue"])
export class NotificationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "utilisateur_id" })
  utilisateur!: UserEntity;

  @ManyToOne(() => ObligationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "obligation_id" })
  obligation!: ObligationEntity | null;

  /** Ex. AVANT_7, AVANT_3, AVANT_1, JOUR_J, RETARD_1, RETARD_3, RETARD_7. */
  @Column({ name: "type_rappel", type: "varchar", length: 24 })
  typeRappel!: string;

  @Column({ type: "varchar", length: 160 })
  titre!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  lien!: string | null;

  @Column({ type: "boolean", default: false })
  lue!: boolean;

  @Column({ name: "cle_idempotence", type: "varchar", length: 200 })
  cleIdempotence!: string;

  @Column({
    name: "statut_courriel",
    type: "enum",
    enum: NotificationEmailStatus,
    enumName: "statut_courriel_notification_enum",
    default: NotificationEmailStatus.EN_ATTENTE,
  })
  statutCourriel!: NotificationEmailStatus;

  @Column({ name: "tentatives_courriel", type: "int", default: 0 })
  tentativesCourriel!: number;

  /** Raison technique courte, sans secret ni donnée personnelle. */
  @Column({
    name: "derniere_erreur_courriel",
    type: "varchar",
    length: 300,
    nullable: true,
  })
  derniereErreurCourriel!: string | null;

  @Column({ name: "courriel_envoye_le", type: "timestamptz", nullable: true })
  courrielEnvoyeLe!: Date | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;
}
