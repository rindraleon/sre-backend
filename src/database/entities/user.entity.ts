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

  @Column({ name: "derniere_connexion", type: "timestamptz", nullable: true })
  derniereConnexion!: Date | null;

  @OneToOne(() => TaxpayerEntity, (contribuable) => contribuable.utilisateur)
  contribuable?: TaxpayerEntity;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
