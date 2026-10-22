import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TaxPeriodicity, TaxpayerType } from "../enums";

@Entity({ name: "types_impots" })
@Index("uq_types_impots_code", ["code"], { unique: true })
export class TaxTypeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 32 })
  code!: string;

  @Column({
      name: "nom",
    type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "text", default: "" })
  description!: string;

  @Column({
      name: "categorie",
    type: "varchar", length: 100 })
  category!: string;

  @Column({
    name: "contribuables_concernes",
    type: "varchar",
    length: 20,
    default: "TOUS",
  })
  applicableTaxpayers!: "TOUS" | TaxpayerType;

  @Column({
      name: "periodicite",
    type: "enum",
    enum: TaxPeriodicity,
    enumName: "periodicite_impot_enum",
  })
  periodicity!: TaxPeriodicity;

  @Column({ name: "regle_echeance", type: "varchar", length: 220, default: "" })
  dueDateRule!: string;

  @Column({
    name: "mode_montant",
    type: "varchar",
    length: 20,
    default: "MANUEL",
  })
  amountMode!: "FIXE" | "CALCULE" | "MANUEL";

  @Column({
    name: "montant_reference",
    type: "numeric",
    precision: 15,
    scale: 0,
    nullable: true,
  })
  referenceAmount!: string | null;

  @Column({
    name: "champs_complementaires",
    type: "jsonb",
    default: () => "'[]'::jsonb",
  })
  additionalFields!: string[];

  @Column({
      name: "actif",
    type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
