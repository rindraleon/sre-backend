import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PeriodiciteImpot, TypeContribuable } from "../enums";

@Entity({ name: "types_impots" })
@Index("uq_types_impots_code", ["code"], { unique: true })
export class TypeImpotEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 32 })
  code!: string;

  @Column({ type: "varchar", length: 160 })
  nom!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({ type: "varchar", length: 100 })
  categorie!: string;

  @Column({
    name: "contribuables_concernes",
    type: "varchar",
    length: 20,
    default: "TOUS",
  })
  contribuablesConcernes!: "TOUS" | TypeContribuable;

  @Column({
    type: "enum",
    enum: PeriodiciteImpot,
    enumName: "periodicite_impot_enum",
  })
  periodicite!: PeriodiciteImpot;

  @Column({ name: "regle_echeance", type: "varchar", length: 220, default: "" })
  regleEcheance!: string;

  @Column({
    name: "mode_montant",
    type: "varchar",
    length: 20,
    default: "MANUEL",
  })
  modeMontant!: "FIXE" | "CALCULE" | "MANUEL";

  @Column({
    name: "montant_reference",
    type: "numeric",
    precision: 15,
    scale: 0,
    nullable: true,
  })
  montantReference!: string | null;

  @Column({
    name: "champs_complementaires",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  champsComplementaires!: string[];

  @Column({ type: "boolean", default: true })
  actif!: boolean;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
