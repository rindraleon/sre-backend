import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { StatutPaiement } from "../enums";
import { PaiementEntity } from "./paiement.entity";
import { UtilisateurEntity } from "./utilisateur.entity";

@Entity({ name: "evenements_paiement" })
export class EvenementPaiementEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => PaiementEntity, (paiement) => paiement.historique, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "paiement_id" })
  paiement!: PaiementEntity;

  @Column({
    type: "enum",
    enum: StatutPaiement,
    enumName: "statut_paiement_enum",
  })
  statut!: StatutPaiement;

  @Column({ type: "varchar", length: 180 })
  libelle!: string;

  @ManyToOne(() => UtilisateurEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "acteur_id" })
  acteur!: UtilisateurEntity | null;

  @Column({
    name: "nom_acteur",
    type: "varchar",
    length: 160,
    default: "Système",
  })
  nomActeur!: string;

  @Column({ type: "text", nullable: true })
  motif!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;
}
