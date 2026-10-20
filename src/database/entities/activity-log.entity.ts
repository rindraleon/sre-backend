import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Journal d'activité (audit) : une ligne par action métier réalisée par un
 * compte authentifié. Alimenté par l'intercepteur global `JournalActiviteInterceptor`,
 * jamais par les contrôleurs — l'audit ne doit pas pouvoir être oublié.
 */
@Entity({ name: "journaux_activite" })
@Index("idx_journaux_activite_cree_le", ["creeLe"])
export class ActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Identifiant du compte à l'origine de l'action (sans jointure forte). */
  @Column({ name: "acteur_id", type: "uuid", nullable: true })
  acteurId!: string | null;

  @Column({
    name: "acteur_nom",
    type: "varchar",
    length: 160,
    default: "Système",
  })
  acteurNom!: string;

  /** ADMIN, CLIENT ou SYSTEME (valeurs hors enum de comptes possibles). */
  @Column({ type: "varchar", length: 16, default: "SYSTEME" })
  role!: string;

  @Column({ type: "varchar", length: 80 })
  action!: string;

  @Column({ type: "varchar", length: 80 })
  ressource!: string;

  @Column({ name: "reference_ressource", type: "varchar", length: 120, nullable: true })
  referenceRessource!: string | null;

  @Column({ type: "varchar", length: 16 })
  resultat!: "SUCCES" | "ECHEC";

  /** Méthode HTTP + chemin traité, message d'erreur en cas d'échec. */
  @Column({ type: "text", nullable: true })
  details!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  creeLe!: Date;
}
