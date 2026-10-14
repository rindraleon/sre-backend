import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TypeContribuable } from "../enums";
import { UtilisateurEntity } from "./utilisateur.entity";

@Entity({ name: "contribuables" })
@Index("uq_contribuables_nif", ["nif"], {
  unique: true,
  where: '"nif" IS NOT NULL',
})
@Index("uq_contribuables_stat", ["stat"], {
  unique: true,
  where: '"stat" IS NOT NULL',
})
export class ContribuableEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @OneToOne(
    () => UtilisateurEntity,
    (utilisateur) => utilisateur.contribuable,
    { nullable: true, onDelete: "SET NULL" },
  )
  @JoinColumn({ name: "utilisateur_id" })
  utilisateur!: UtilisateurEntity | null;

  @Column({
    type: "enum",
    enum: TypeContribuable,
    enumName: "type_contribuable_enum",
  })
  type!: TypeContribuable;

  @Column({ type: "varchar", length: 120 })
  nom!: string;

  @Column({ type: "varchar", length: 120, nullable: true })
  prenom!: string | null;

  @Column({
    name: "raison_sociale",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  raisonSociale!: string | null;

  @Column({
    name: "nom_commercial",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  nomCommercial!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  nif!: string | null;

  @Column({ type: "varchar", length: 40, nullable: true })
  stat!: string | null;

  @Column({ type: "varchar", length: 220 })
  adresse!: string;

  @Column({ type: "varchar", length: 120 })
  region!: string;

  @Column({ type: "varchar", length: 120 })
  ville!: string;

  @Column({ type: "varchar", length: 254 })
  courriel!: string;

  @Column({ type: "varchar", length: 40 })
  telephone!: string;

  @Column({
    name: "representant_legal",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  representantLegal!: string | null;

  @Column({ name: "nom_contact", type: "varchar", length: 120, nullable: true })
  nomContact!: string | null;

  @Column({
    name: "prenom_contact",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  prenomContact!: string | null;

  @Column({
    name: "fonction_contact",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  fonctionContact!: string | null;

  @Column({ name: "date_creation_compte", type: "timestamptz" })
  dateCreationCompte!: Date;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
