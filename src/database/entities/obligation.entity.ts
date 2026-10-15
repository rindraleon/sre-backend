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
@Index("uq_obligations_reference", ["referenceFiscale"], { unique: true })
@Index("idx_obligations_contribuable_statut", ["contribuable", "statut"])
export class ObligationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: TaxpayerEntity;

  @ManyToOne(() => TaxTypeEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "type_impot_id" })
  typeImpot!: TaxTypeEntity;

  @Column({ name: "reference_fiscale", type: "varchar", length: 64 })
  referenceFiscale!: string;

  @Column({ type: "varchar", length: 80 })
  periode!: string;

  @Column({ type: "numeric", precision: 15, scale: 0 })
  montant!: string;

  @Column({ type: "char", length: 3, default: "MGA" })
  devise!: "MGA";

  @Column({ type: "date" })
  echeance!: string;

  @Column({
    type: "enum",
    enum: ObligationStatus,
    enumName: "statut_obligation_enum",
    default: ObligationStatus.A_PAYER,
  })
  statut!: ObligationStatus;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
