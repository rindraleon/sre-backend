import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Nouvelles valeurs du statut de paiement : EN_ATTENTE (déclaration déposée),
 * ECHEC (refus du mécanisme de paiement) et ANNULE (annulation).
 *
 * Migration isolée : PostgreSQL interdit d'utiliser une valeur d'énumération
 * ajoutée dans la transaction courante ; les colonnes et index qui s'appuient sur
 * ces valeurs sont créés par la migration suivante.
 */
export class StatutsPaiementAutonome1760350000000 implements MigrationInterface {
  name = "StatutsPaiementAutonome1760350000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ["EN_ATTENTE", "ECHEC", "ANNULE"]) {
      await queryRunner.query(
        `ALTER TYPE statut_paiement_enum ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
  }

  async down(): Promise<void> {
    // Les valeurs d'énumération ne sont pas retirées : des lignes peuvent les utiliser.
  }
}
