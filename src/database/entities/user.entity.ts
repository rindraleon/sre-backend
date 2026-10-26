import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { AccountRole, AccountStatus } from "../enums";
import { TaxpayerEntity } from "./taxpayer.entity";

@Entity({ name: "utilisateurs" })
@Index("uq_utilisateurs_courriel", ["email"], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
      name: "nom",
    type: "varchar", length: 160 })
  name!: string;

  @Column({
      name: "courriel",
    type: "varchar", length: 254 })
  email!: string;

  @Column({
    name: "mot_de_passe_hash",
    type: "varchar",
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({
    type: "enum",
    enum: AccountRole,
    enumName: "role_compte_enum",
    default: AccountRole.CLIENT,
  })
  role!: AccountRole;

  @Column({
      name: "statut",
    type: "enum",
    enum: AccountStatus,
    enumName: "statut_compte_enum",
    default: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @Column({
    name: "changement_mot_de_passe_requis",
    type: "boolean",
    default: false,
  })
  mustChangePassword!: boolean;

  /** Profile completed / verified by the user (initial setup). */
  @Column({ name: "profil_complete", type: "boolean", default: true })
  isProfileComplete!: boolean;

  @Column({ name: "derniere_connexion", type: "timestamptz", nullable: true })
  lastLoginAt!: Date | null;

  /** E-mail address verification by single-use code. */
  @Column({ name: "courriel_verifie", type: "boolean", default: false })
  isEmailVerified!: boolean;

  @Column({
    name: "verification_courriel_code_hash",
    type: "varchar",
    length: 128,
    nullable: true,
    select: false,
  })
  emailVerificationCodeHash!: string | null;

  @Column({
    name: "verification_courriel_expire_le",
    type: "timestamptz",
    nullable: true,
    select: false,
  })
  emailVerificationExpiresAt!: Date | null;

  @OneToOne(() => TaxpayerEntity, (taxpayer) => taxpayer.user)
  taxpayer?: TaxpayerEntity;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
