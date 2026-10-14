import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { StatutDocument, TypeDocumentPaiement } from "../enums";
import { ContribuableEntity } from "./contribuable.entity";
import { PaiementEntity } from "./paiement.entity";
import { UtilisateurEntity } from "./utilisateur.entity";

@Entity({ name: "documents_paiement" })
@Index("uq_documents_paiement_numero", ["numero"], { unique: true })
@Index("uq_documents_paiement_type", ["paiement", "type"], { unique: true })
@Index("idx_documents_contribuable_emis", ["contribuable", "emisLe"])
export class DocumentPaiementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 48 })
  numero!: string;

  @Column({
    type: "enum",
    enum: TypeDocumentPaiement,
    enumName: "type_document_paiement_enum",
  })
  type!: TypeDocumentPaiement;

  @Column({
    type: "enum",
    enum: StatutDocument,
    enumName: "statut_document_enum",
    default: StatutDocument.VALIDE,
  })
  statut!: StatutDocument;

  @ManyToOne(() => PaiementEntity, (paiement) => paiement.documents, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  paiement!: PaiementEntity;

  @ManyToOne(() => ContribuableEntity, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "contribuable_id" })
  contribuable!: ContribuableEntity;

  @ManyToOne(() => UtilisateurEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "emis_par_id" })
  emisPar!: UtilisateurEntity | null;

  @Column({ name: "montant", type: "numeric", precision: 15, scale: 0 })
  montant!: string;

  @Column({ type: "char", length: 3, default: "MGA" })
  devise!: "MGA";

  @Column({ name: "emetteur", type: "varchar", length: 180 })
  emetteur!: string;

  @Column({ name: "mention", type: "text" })
  mention!: string;

  @Column({ type: "jsonb" })
  instantane!: Record<string, unknown>;

  @CreateDateColumn({ name: "emis_le", type: "timestamptz" })
  emisLe!: Date;
}
