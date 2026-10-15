import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { PaymentMethod, PaymentOperator, PaymentStatus } from "../enums";
import { TaxpayerEntity } from "./taxpayer.entity";
import { PaymentDocumentEntity } from "./payment-document.entity";
import { ObligationEntity } from "./obligation.entity";
import { PaymentEventEntity } from "./payment-event.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "paiements" })
@Index("uq_paiements_reference_interne", ["referenceInterne"], { unique: true })
@Index("idx_paiements_contribuable_soumis", ["contribuable", "soumisLe"])
@Index("idx_paiements_statut", ["statut"])
export class PaymentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reference_interne", type: "varchar", length: 48 })
  referenceInterne!: string;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: TaxpayerEntity;

  @ManyToOne(() => ObligationEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "obligation_id" })
  obligation!: ObligationEntity;

  @Column({ type: "numeric", precision: 15, scale: 0 })
  montant!: string;

  @Column({ type: "char", length: 3, default: "MGA" })
  devise!: "MGA";

  @Column({ type: "enum", enum: PaymentMethod, enumName: "mode_paiement_enum" })
  mode!: PaymentMethod;

  @Column({
    type: "enum",
    enum: PaymentOperator,
    enumName: "operateur_paiement_enum",
    nullable: true,
  })
  operateur!: PaymentOperator | null;

  @Column({
    name: "telephone_utilise",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  telephoneUtilise!: string | null;

  @Column({
    name: "banque_ou_canal",
    type: "varchar",
    length: 140,
    nullable: true,
  })
  banqueOuCanal!: string | null;

  @Column({
    name: "titulaire_payeur",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  titulairePayeur!: string | null;

  @Column({ name: "reference_transaction", type: "varchar", length: 128 })
  referenceTransaction!: string;

  @Column({ name: "date_transaction", type: "date" })
  dateTransaction!: string;

  @Column({
    name: "justificatif_nom",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  justificatifNom!: string | null;

  @Column({
    type: "enum",
    enum: PaymentStatus,
    enumName: "statut_paiement_enum",
    default: PaymentStatus.EN_VERIFICATION,
  })
  statut!: PaymentStatus;

  @Column({ name: "valide_le", type: "timestamptz", nullable: true })
  valideLe!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "valide_par_id" })
  validePar!: UserEntity | null;

  @Column({ name: "motif_decision", type: "text", nullable: true })
  motifDecision!: string | null;

  @OneToMany(() => PaymentEventEntity, (evenement) => evenement.paiement)
  historique!: PaymentEventEntity[];

  @OneToMany(() => PaymentDocumentEntity, (document) => document.paiement)
  documents!: PaymentDocumentEntity[];

  @CreateDateColumn({ name: "soumis_le", type: "timestamptz" })
  soumisLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
