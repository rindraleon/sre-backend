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
@Index("uq_utilisateurs_courriel", ["courriel"], { unique: true })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160 })
  nom!: string;

  @Column({ type: "varchar", length: 254 })
  courriel!: string;

  @Column({
    name: "mot_de_passe_hash",
    type: "varchar",
    length: 255,
    select: false,
  })
  motDePasseHash!: string;

  @Column({
    type: "enum",
    enum: AccountRole,
    enumName: "role_compte_enum",
    default: AccountRole.CLIENT,
  })
  role!: AccountRole;

  @Column({
    type: "enum",
    enum: AccountStatus,
    enumName: "statut_compte_enum",
    default: AccountStatus.ACTIF,
  })
  statut!: AccountStatus;

  @Column({
    name: "changement_mot_de_passe_requis",
    type: "boolean",
    default: false,
  })
  changementMotDePasseRequis!: boolean;

  /**
   * Profil complété / vérifié par l'utilisateur (configuration initiale).
   * Tant que `changementMotDePasseRequis` ou `!profilComplete`, les routes
   * métier restent bloquées côté serveur (parcours de configuration).
   */
  @Column({ name: "profil_complete", type: "boolean", default: true })
  profilComplete!: boolean;

  @Column({ name: "derniere_connexion", type: "timestamptz", nullable: true })
  derniereConnexion!: Date | null;

  /** Vérification de l'adresse e-mail par code à usage unique. */
  @Column({ name: "courriel_verifie", type: "boolean", default: false })
  courrielVerifie!: boolean;

  @Column({
    name: "verification_courriel_code_hash",
    type: "varchar",
    length: 128,
    nullable: true,
    select: false,
  })
  verificationCourrielCodeHash!: string | null;

  @Column({
    name: "verification_courriel_expire_le",
    type: "timestamptz",
    nullable: true,
    select: false,
  })
  verificationCourrielExpireLe!: Date | null;

  @OneToOne(() => TaxpayerEntity, (contribuable) => contribuable.utilisateur)
  contribuable?: TaxpayerEntity;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
