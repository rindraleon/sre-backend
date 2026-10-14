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
import { ModePaiement, OperateurPaiement, StatutPaiement } from "../enums";
import { ContribuableEntity } from "./contribuable.entity";
import { DocumentPaiementEntity } from "./document-paiement.entity";
import { ObligationEntity } from "./obligation.entity";
import { EvenementPaiementEntity } from "./evenement-paiement.entity";
import { UtilisateurEntity } from "./utilisateur.entity";

@Entity({ name: "paiements" })
@Index("uq_paiements_reference_interne", ["referenceInterne"], { unique: true })
@Index("idx_paiements_contribuable_soumis", ["contribuable", "soumisLe"])
@Index("idx_paiements_statut", ["statut"])
export class PaiementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "reference_interne", type: "varchar", length: 48 })
  referenceInterne!: string;

  @ManyToOne(() => ContribuableEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: ContribuableEntity;

  @ManyToOne(() => ObligationEntity, { nullable: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "obligation_id" })
  obligation!: ObligationEntity;

  @Column({ type: "numeric", precision: 15, scale: 0 })
  montant!: string;

  @Column({ type: "char", length: 3, default: "MGA" })
  devise!: "MGA";

  @Column({ type: "enum", enum: ModePaiement, enumName: "mode_paiement_enum" })
  mode!: ModePaiement;

  @Column({
    type: "enum",
    enum: OperateurPaiement,
    enumName: "operateur_paiement_enum",
    nullable: true,
  })
  operateur!: OperateurPaiement | null;

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
    enum: StatutPaiement,
    enumName: "statut_paiement_enum",
    default: StatutPaiement.EN_VERIFICATION,
  })
  statut!: StatutPaiement;

  @Column({ name: "valide_le", type: "timestamptz", nullable: true })
  valideLe!: Date | null;

  @ManyToOne(() => UtilisateurEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "valide_par_id" })
  validePar!: UtilisateurEntity | null;

  @Column({ name: "motif_decision", type: "text", nullable: true })
  motifDecision!: string | null;

  @OneToMany(() => EvenementPaiementEntity, (evenement) => evenement.paiement)
  historique!: EvenementPaiementEntity[];

  @OneToMany(() => DocumentPaiementEntity, (document) => document.paiement)
  documents!: DocumentPaiementEntity[];

  @CreateDateColumn({ name: "soumis_le", type: "timestamptz" })
  soumisLe!: Date;

  @UpdateDateColumn({ name: "modifie_le", type: "timestamptz" })
  modifieLe!: Date;
}
