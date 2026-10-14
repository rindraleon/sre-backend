import { MigrationInterface, QueryRunner } from "typeorm";

export class RetirerIndicateurDemonstration1760270401000 implements MigrationInterface {
  name = "RetirerIndicateurDemonstration1760270401000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE types_impots DROP COLUMN IF EXISTS est_demo`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE types_impots ADD COLUMN IF NOT EXISTS est_demo boolean NOT NULL DEFAULT false`,
    );
  }
}
