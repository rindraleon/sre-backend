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
import { StatutObligation } from "../enums";
import { ContribuableEntity } from "./contribuable.entity";
import { TypeImpotEntity } from "./type-impot.entity";

@Entity({ name: "obligations" })
@Index("uq_obligations_reference", ["referenceFiscale"], { unique: true })
@Index("idx_obligations_contribuable_statut", ["contribuable", "statut"])
export class ObligationEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => ContribuableEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: ContribuableEntity;

  @ManyToOne(() => TypeImpotEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "type_impot_id" })
  typeImpot!: TypeImpotEntity;

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
    enum: StatutObligation,
    enumName: "statut_obligation_enum",
    default: StatutObligation.A_PAYER,
  })
  statut!: StatutObligation;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
