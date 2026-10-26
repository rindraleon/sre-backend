import { MigrationInterface, QueryRunner } from "typeorm";

/** Première connexion des comptes créés par import. */
export class PremiereConnexionEntreprises1760270404000
  implements MigrationInterface
{
  name = "PremiereConnexionEntreprises1760270404000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE utilisateurs ADD COLUMN profil_complete boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `CREATE TYPE type_jetons_enum AS ENUM ('ACTIVATION', 'REINITIALISATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE statut_courriel_activation_enum AS ENUM ('EN_ATTENTE', 'ENVOYEE', 'ECHEC')`,
    );
    await queryRunner.query(`
      CREATE TABLE demandes_activation (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        utilisateur_id uuid NOT NULL,
        type type_jetons_enum NOT NULL,
        jeton_hash varchar(64) NOT NULL,
        expire_le timestamptz NOT NULL,
        utilise_le timestamptz,
        destinataire varchar(254) NOT NULL,
        statut_courriel statut_courriel_activation_enum NOT NULL DEFAULT 'EN_ATTENTE',
        tentatives_envoi int NOT NULL DEFAULT 0,
        derniere_tentative_le timestamptz,
        derniere_erreur varchar(254),
        cree_le timestamptz NOT NULL DEFAULT now(),
        modifie_le timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_demandes_activation_utilisateur
          FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_demandes_activation_jeton ON demandes_activation (jeton_hash)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_demandes_activation_utilisateur ON demandes_activation (utilisateur_id, type)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS demandes_activation`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS statut_courriel_activation_enum`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS type_jetons_enum`);
    await queryRunner.query(
      `ALTER TABLE utilisateurs DROP COLUMN IF EXISTS profil_complete`,
    );
  }
}
