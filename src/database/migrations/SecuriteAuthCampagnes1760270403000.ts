import { MigrationInterface, QueryRunner } from "typeorm";

/** Renforcement de l'authentification et campagnes de notification. */
export class SecuriteAuthCampagnes1760270403000
  implements MigrationInterface
{
  name = "SecuriteAuthCampagnes1760270403000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE tentatives_connexion (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        courriel varchar(254) NOT NULL,
        succes boolean NOT NULL DEFAULT false,
        motif varchar(120),
        adresse_ip varchar(64),
        cree_le timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_tentatives_connexion_courriel_cree ON tentatives_connexion (courriel, cree_le)`,
    );

    await queryRunner.query(
      `ALTER TABLE utilisateurs ADD COLUMN courriel_verifie boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE utilisateurs ADD COLUMN verification_courriel_code_hash varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE utilisateurs ADD COLUMN verification_courriel_expire_le timestamptz`,
    );

    await queryRunner.query(
      `ALTER TABLE notifications ADD COLUMN cree_par_id uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE notifications
        ADD CONSTRAINT fk_notifications_cree_par
        FOREIGN KEY (cree_par_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX idx_notifications_type_rappel_cree ON notifications (type_rappel, cree_le)`,
    );

    // État « délivré » réservé à une confirmation explicite du fournisseur.
    await queryRunner.query(
      `ALTER TYPE statut_courriel_notification_enum ADD VALUE IF NOT EXISTS 'DELIVRE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les ajouts de valeur d'enum PostgreSQL ne sont pas réversibles.
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_cree_par`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_notifications_type_rappel_cree`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP COLUMN IF EXISTS cree_par_id`,
    );
    await queryRunner.query(
      `ALTER TABLE utilisateurs DROP COLUMN IF EXISTS verification_courriel_expire_le`,
    );
    await queryRunner.query(
      `ALTER TABLE utilisateurs DROP COLUMN IF EXISTS verification_courriel_code_hash`,
    );
    await queryRunner.query(
      `ALTER TABLE utilisateurs DROP COLUMN IF EXISTS courriel_verifie`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS tentatives_connexion`);
  }
}
