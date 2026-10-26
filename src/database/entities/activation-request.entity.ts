import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  ActivationEmailStatus,
  ActivationTokenType,
} from "../enums";
import { UserEntity } from "./user.entity";

/** Activation / reset request: secure single-purpose token (SHA-256 fingerprint, never stored in plain text) and e-. */
@Entity({ name: "demandes_activation" })
@Index("uq_demandes_activation_jeton", ["tokenHash"], { unique: true })
@Index("idx_demandes_activation_utilisateur", ["userId", "type"])
export class ActivationRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "utilisateur_id" })
  user!: UserEntity;

  @Column({ name: "utilisateur_id", type: "uuid" })
  userId!: string;

  @Column({
    type: "enum",
    enum: ActivationTokenType,
    enumName: "type_jetons_enum",
  })
  type!: ActivationTokenType;

  /** SHA-256 fingerprint of the token — the plain token is never stored. */
  @Column({ name: "jeton_hash", type: "varchar", length: 64 })
  tokenHash!: string;

  @Column({ name: "expire_le", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "utilise_le", type: "timestamptz", nullable: true })
  usedAt!: Date | null;

  @Column({ name: "destinataire", type: "varchar", length: 254 })
  recipient!: string;

  @Column({
    name: "statut_courriel",
    type: "enum",
    enum: ActivationEmailStatus,
    enumName: "statut_courriel_activation_enum",
    default: ActivationEmailStatus.PENDING,
  })
  emailStatus!: ActivationEmailStatus;

  @Column({ name: "tentatives_envoi", type: "int", default: 0 })
  dispatchAttempts!: number;

  @Column({ name: "derniere_tentative_le", type: "timestamptz", nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: "derniere_erreur", type: "varchar", length: 254, nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
