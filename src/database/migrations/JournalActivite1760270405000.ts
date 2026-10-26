import { MigrationInterface, QueryRunner } from "typeorm";

/** Journal d'activité (audit). */
export class JournalActivite1760270405000 implements MigrationInterface {
  name = "JournalActivite1760270405000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE journaux_activite (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        acteur_id uuid,
        acteur_nom varchar(160) NOT NULL DEFAULT 'Système',
        role varchar(16) NOT NULL DEFAULT 'SYSTEME',
        action varchar(80) NOT NULL,
        ressource varchar(80) NOT NULL,
        reference_ressource varchar(120),
        resultat varchar(16) NOT NULL,
        details text,
        cree_le timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      ALTER TABLE journaux_activite
        ADD CONSTRAINT fk_journaux_activite_acteur
        FOREIGN KEY (acteur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX idx_journaux_activite_cree_le ON journaux_activite (cree_le DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_journaux_activite_cree_le`,
    );
    await queryRunner.query(
      `ALTER TABLE journaux_activite DROP CONSTRAINT IF EXISTS fk_journaux_activite_acteur`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS journaux_activite`);
  }
}
