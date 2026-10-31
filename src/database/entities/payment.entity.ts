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
import {
  PaymentMethod,
  PaymentOperator,
  PaymentOrigin,
  PaymentStatus,
} from "../enums";
import { TaxpayerEntity } from "./taxpayer.entity";
import { PaymentDocumentEntity } from "./payment-document.entity";
import { ObligationEntity } from "./obligation.entity";
import { PaymentEventEntity } from "./payment-event.entity";
import { TaxTypeEntity } from "./tax-type.entity";
import { UserEntity } from "./user.entity";

@Entity({ name: "paiements" })
@Index("uq_paiements_reference_interne", ["internalReference"], { unique: true })
@Index("idx_paiements_contribuable_soumis", ["taxpayer", "submittedAt"])
@Index("idx_paiements_statut", ["status"])
@Index("idx_paiements_type_impot", ["taxType"])
@Index("idx_paiements_periode_fiscale", ["fiscalPeriod"])
export class PaymentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reference_interne", type: "varchar", length: 48 })
  internalReference!: string;

  @ManyToOne(() => TaxpayerEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  taxpayer!: TaxpayerEntity;

  /**
   * Obligation fiscale éventuelle. Nulle pour une déclaration autonome saisie
   * par le contribuable (montant, nature d'impôt et période choisis par lui).
   */
  @ManyToOne(() => ObligationEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "obligation_id" })
  obligation!: ObligationEntity | null;

  /** Nature d'impôt déclarée. Toujours renseignée (reprise de l'obligation si présente). */
  @ManyToOne(() => TaxTypeEntity, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "type_impot_id" })
  taxType!: TaxTypeEntity | null;

  /** Période fiscale déclarée (ex. « 2026-03 », « 2026-T1 », « 2026 »). */
  @Column({
    name: "periode_fiscale",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  fiscalPeriod!: string | null;

  @Column({
    name: "debut_periode",
    type: "date",
    nullable: true,
  })
  periodStart!: string | null;

  @Column({
    name: "fin_periode",
    type: "date",
    nullable: true,
  })
  periodEnd!: string | null;

  @Column({ name: "montant", type: "numeric", precision: 15, scale: 0 })
  amount!: string;

  @Column({ name: "devise", type: "char", length: 3, default: "MGA" })
  currency!: "MGA";

  @Column({ type: "enum", enum: PaymentMethod, enumName: "mode_paiement_enum" })
  mode!: PaymentMethod;

  @Column({
    name: "operateur",
    type: "enum",
    enum: PaymentOperator,
    enumName: "operateur_paiement_enum",
    nullable: true,
  })
  operator!: PaymentOperator | null;

  @Column({
    name: "telephone_utilise",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  usedPhone!: string | null;

  @Column({
    name: "banque_ou_canal",
    type: "varchar",
    length: 140,
    nullable: true,
  })
  bankOrChannel!: string | null;

  @Column({
    name: "titulaire_payeur",
    type: "varchar",
    length: 180,
    nullable: true,
  })
  payerName!: string | null;

  @Column({ name: "reference_transaction", type: "varchar", length: 128 })
  transactionReference!: string;

  @Column({ name: "date_transaction", type: "date" })
  transactionDate!: string;

  @Column({
    name: "justificatif_nom",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  supportingDocumentName!: string | null;

  @Column({
    name: "origine",
    type: "enum",
    enum: PaymentOrigin,
    enumName: "origine_paiement_enum",
    default: PaymentOrigin.OBLIGATION,
  })
  origin!: PaymentOrigin;

  /** Clé d'idempotence fournie par le client : protège des doubles soumissions. */
  @Column({
    name: "cle_idempotence",
    type: "varchar",
    length: 80,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({
    name: "statut",
    type: "enum",
    enum: PaymentStatus,
    enumName: "statut_paiement_enum",
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  /** Horodatage de la confirmation effective du paiement (jamais la date de soumission). */
  @Column({ name: "confirme_le", type: "timestamptz", nullable: true })
  confirmedAt!: Date | null;

  /** Référence du mécanisme de paiement (opérateur, banque, rapprochement). */
  @Column({
    name: "reference_fournisseur",
    type: "varchar",
    length: 128,
    nullable: true,
  })
  providerReference!: string | null;

  @Column({
    name: "fournisseur",
    type: "varchar",
    length: 40,
    nullable: true,
  })
  provider!: string | null;

  @Column({ name: "motif_echec", type: "text", nullable: true })
  failureReason!: string | null;

  @Column({ name: "valide_le", type: "timestamptz", nullable: true })
  validatedAt!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "valide_par_id" })
  validatedBy!: UserEntity | null;

  @Column({ name: "motif_decision", type: "text", nullable: true })
  decisionReason!: string | null;

  @Column({ name: "annule_le", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => PaymentEventEntity, (event) => event.payment)
  history!: PaymentEventEntity[];

  @OneToMany(() => PaymentDocumentEntity, (document) => document.payment)
  documents!: PaymentDocumentEntity[];

  @CreateDateColumn({ name: "soumis_le", type: "timestamptz" })
  submittedAt!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  updatedAt!: Date;
}
