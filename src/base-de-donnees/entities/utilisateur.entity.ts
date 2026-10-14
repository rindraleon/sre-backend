import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RoleCompte, StatutCompte } from "../enums";
import { ContribuableEntity } from "./contribuable.entity";

@Entity({ name: "utilisateurs" })
@Index("uq_utilisateurs_courriel", ["courriel"], { unique: true })
export class UtilisateurEntity {
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
    enum: RoleCompte,
    enumName: "role_compte_enum",
    default: RoleCompte.CLIENT,
  })
  role!: RoleCompte;

  @Column({
    type: "enum",
    enum: StatutCompte,
    enumName: "statut_compte_enum",
    default: StatutCompte.ACTIF,
  })
  statut!: StatutCompte;

  @Column({
    name: "changement_mot_de_passe_requis",
    type: "boolean",
    default: false,
  })
  changementMotDePasseRequis!: boolean;

  @Column({ name: "derniere_connexion", type: "timestamptz", nullable: true })
  derniereConnexion!: Date | null;

  @OneToOne(
    () => ContribuableEntity,
    (contribuable) => contribuable.utilisateur,
  )
  contribuable?: ContribuableEntity;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
