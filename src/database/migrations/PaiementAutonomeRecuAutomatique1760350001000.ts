import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Paiement autonome du contribuable + reçu généré automatiquement après confirmation.
 *
 * Les nouvelles valeurs d'énumération (EN_ATTENTE, ECHEC, ANNULE) sont créées par
 * la migration StatutsPaiementAutonome1760350000000, qui doit s'exécuter avant.
 * - `obligation_id` devient facultative (déclaration sans obligation préalable) ;
 * - nature d'impôt, période fiscale, origine, clé d'idempotence et informations de
 *   confirmation ajoutées au paiement ;
 * - contraintes d'unicité : une déclaration par clé d'idempotence, une seule
 *   transaction par référence/canal tant qu'elle n'est ni annulée ni rejetée ;
 * - code de vérification sur les documents.
 */
export class PaiementAutonomeRecuAutomatique1760350001000
  implements MigrationInterface
{
  name = "PaiementAutonomeRecuAutomatique1760350001000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Origine de la déclaration.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE origine_paiement_enum AS ENUM ('DECLARATION_AUTONOME', 'OBLIGATION');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // 2. Colonnes du paiement autonome.
    await queryRunner.query(`
      ALTER TABLE paiements
        ADD COLUMN IF NOT EXISTS type_impot_id uuid,
        ADD COLUMN IF NOT EXISTS periode_fiscale varchar(40),
        ADD COLUMN IF NOT EXISTS debut_periode date,
        ADD COLUMN IF NOT EXISTS fin_periode date,
        ADD COLUMN IF NOT EXISTS origine origine_paiement_enum NOT NULL DEFAULT 'OBLIGATION',
        ADD COLUMN IF NOT EXISTS cle_idempotence varchar(80),
        ADD COLUMN IF NOT EXISTS confirme_le timestamptz,
        ADD COLUMN IF NOT EXISTS reference_fournisseur varchar(128),
        ADD COLUMN IF NOT EXISTS fournisseur varchar(40),
        ADD COLUMN IF NOT EXISTS motif_echec text,
        ADD COLUMN IF NOT EXISTS annule_le timestamptz
    `);

    // 3. L'obligation fiscale préalable n'est plus obligatoire.
    await queryRunner.query(`
      ALTER TABLE paiements ALTER COLUMN obligation_id DROP NOT NULL
    `);

    // 4. Reprise des données existantes (nature d'impôt et période depuis l'obligation).
    await queryRunner.query(`
      UPDATE paiements p
      SET type_impot_id = o.type_impot_id,
          periode_fiscale = COALESCE(p.periode_fiscale, o.periode)
      FROM obligations o
      WHERE p.obligation_id = o.id
        AND p.type_impot_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE paiements
      SET confirme_le = valide_le
      WHERE statut = 'CONFIRME' AND valide_le IS NOT NULL AND confirme_le IS NULL
    `);

    // 5. Clés étrangères et index.
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE paiements
          ADD CONSTRAINT fk_paiements_type_impot
          FOREIGN KEY (type_impot_id) REFERENCES types_impots(id) ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_paiements_type_impot ON paiements (type_impot_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_paiements_periode_fiscale ON paiements (periode_fiscale)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_paiements_confirme_le ON paiements (confirme_le)`,
    );

    // Une seule déclaration par clé d'idempotence (protection double soumission).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_cle_idempotence
      ON paiements (cle_idempotence)
      WHERE cle_idempotence IS NOT NULL
    `);

    // Une même référence de transaction ne peut pas être enregistrée deux fois
    // tant qu'elle n'est ni annulée, ni rejetée, ni en échec.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_paiements_reference_transaction
      ON paiements (mode, reference_transaction)
      WHERE statut NOT IN ('ANNULE', 'REJETE', 'ECHEC')
    `);

    // 6. Code de vérification des documents.
    await queryRunner.query(`
      ALTER TABLE documents_paiement
        ADD COLUMN IF NOT EXISTS code_verification varchar(32)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_paiements_reference_transaction`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_paiements_cle_idempotence`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_paiements_confirme_le`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_paiements_periode_fiscale`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_paiements_type_impot`);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE paiements DROP CONSTRAINT IF EXISTS fk_paiements_type_impot;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE documents_paiement DROP COLUMN IF EXISTS code_verification
    `);
    await queryRunner.query(`
      ALTER TABLE paiements
        DROP COLUMN IF EXISTS type_impot_id,
        DROP COLUMN IF EXISTS periode_fiscale,
        DROP COLUMN IF EXISTS debut_periode,
        DROP COLUMN IF EXISTS fin_periode,
        DROP COLUMN IF EXISTS origine,
        DROP COLUMN IF EXISTS cle_idempotence,
        DROP COLUMN IF EXISTS confirme_le,
        DROP COLUMN IF EXISTS reference_fournisseur,
        DROP COLUMN IF EXISTS fournisseur,
        DROP COLUMN IF EXISTS motif_echec,
        DROP COLUMN IF EXISTS annule_le
    `);
    // `obligation_id` n'est pas remise en NOT NULL : des déclarations autonomes
    // peuvent exister et l'historique doit rester lisible.
    await queryRunner.query(`DROP TYPE IF EXISTS origine_paiement_enum`);
  }
}
