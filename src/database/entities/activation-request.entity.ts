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

/**
 * Demande d'activation / de réinitialisation : jeton sécurisé à usage limité
 * (empreinte SHA-256, jamais stocké en clair) et suivi d'envoi du courriel.
 * Idempotence : une seule demande active (non utilisée, non expirée) par
 * utilisateur et par type.
 */
@Entity({ name: "demandes_activation" })
@Index("uq_demandes_activation_jeton", ["jetonHash"], { unique: true })
@Index("idx_demandes_activation_utilisateur", ["utilisateurId", "type"])
export class ActivationRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "utilisateur_id" })
  utilisateur!: UserEntity;

  @Column({ name: "utilisateur_id", type: "uuid" })
  utilisateurId!: string;

  @Column({
    type: "enum",
    enum: ActivationTokenType,
    enumName: "type_jetons_enum",
  })
  type!: ActivationTokenType;

  /** Empreinte SHA-256 du jeton — le jeton en clair n'est jamais stocké. */
  @Column({ name: "jeton_hash", type: "varchar", length: 64 })
  jetonHash!: string;

  @Column({ name: "expire_le", type: "timestamptz" })
  expireLe!: Date;

  @Column({ name: "utilise_le", type: "timestamptz", nullable: true })
  utiliseLe!: Date | null;

  @Column({ name: "destinataire", type: "varchar", length: 254 })
  destinataire!: string;

  @Column({
    name: "statut_courriel",
    type: "enum",
    enum: ActivationEmailStatus,
    enumName: "statut_courriel_activation_enum",
    default: ActivationEmailStatus.EN_ATTENTE,
  })
  statutCourriel!: ActivationEmailStatus;

  @Column({ name: "tentatives_envoi", type: "int", default: 0 })
  tentativesEnvoi!: number;

  @Column({ name: "derniere_tentative_le", type: "timestamptz", nullable: true })
  derniereTentativeLe!: Date | null;

  @Column({ name: "derniere_erreur", type: "varchar", length: 254, nullable: true })
  derniereErreur!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
