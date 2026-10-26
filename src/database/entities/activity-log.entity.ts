import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/** Activity log (audit): one row per business action performed by an authenticated account. */
@Entity({ name: "journaux_activite" })
@Index("idx_journaux_activite_cree_le", ["createdAt"])
export class ActivityLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Identifier of the account behind the action (no strong join). */
  @Column({ name: "acteur_id", type: "uuid", nullable: true })
  actorId!: string | null;

  @Column({
    name: "acteur_nom",
    type: "varchar",
    length: 160,
    default: "Système",
  })
  actorName!: string;

  /** ADMIN, CLIENT or SYSTEME (values outside the account enum are possible). */
  @Column({ type: "varchar", length: 16, default: "SYSTEME" })
  role!: string;

  @Column({ type: "varchar", length: 80 })
  action!: string;

  @Column({
      name: "ressource",
    type: "varchar", length: 80 })
  resource!: string;

  @Column({ name: "reference_ressource", type: "varchar", length: 120, nullable: true })
  resourceReference!: string | null;

  @Column({
      name: "resultat",
    type: "varchar", length: 16 })
  result!: "SUCCES" | "ECHEC";

  /** HTTP method + processed path, error message on failure. */
  @Column({ type: "text", nullable: true })
  details!: string | null;

  @CreateDateColumn({ name: "cree_le", type: "timestamptz" })
  createdAt!: Date;
}
