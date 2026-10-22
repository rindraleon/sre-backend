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
import { ObligationStatus } from "../enums";
import { TaxpayerEntity } from "./taxpayer.entity";
import { TaxTypeEntity } from "./tax-type.entity";

@Entity({ name: "obligations" })
@Index("uq_obligations_reference", ["taxReference"], { unique: true })
@Index("idx_obligations_contribuable_statut", ["taxpayer", "status"])
export class ObligationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  taxpayer!: TaxpayerEntity;

  @ManyToOne(() => TaxTypeEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "type_impot_id" })
  taxType!: TaxTypeEntity;

  @Column({ name: "reference_fiscale", type: "varchar", length: 64 })
  taxReference!: string;

  @Column({
      name: "periode",
    type: "varchar", length: 80 })
  period!: string;

  @Column({
      name: "montant",
    type: "numeric", precision: 15, scale: 0 })
  amount!: string;

  @Column({
      name: "devise",
    type: "char", length: 3, default: "MGA" })
  currency!: "MGA";

  @Column({
      name: "echeance",
    type: "date" })
  dueDate!: string;

  @Column({
      name: "statut",
    type: "enum",
    enum: ObligationStatus,
    enumName: "statut_obligation_enum",
    default: ObligationStatus.TO_PAY,
  })
  status!: ObligationStatus;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
