import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PaymentMethod, PaymentStatus } from "../../database/enums";
import { CreatePaymentDto } from "./create-payment.dto";
import { PaymentDecisionDto } from "./payment-decision.dto";

describe("validation des déclarations et décisions de paiement", () => {
  it("accepte une déclaration de virement sans prétendre vérifier un transfert", async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      obligationId: "00000000-0000-4000-8000-000000000001",
      mode: PaymentMethod.VIREMENT_BANCAIRE,
      banqueOuCanal: "Banque déclarée",
      referenceTransaction: "REF-2026-001",
      dateTransaction: "2026-10-15",
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it("exige opérateur et téléphone pour une déclaration mobile money", async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      obligationId: "00000000-0000-4000-8000-000000000001",
      mode: PaymentMethod.MOBILE_MONEY,
      referenceTransaction: "REF-2026-002",
      dateTransaction: "2026-10-15",
    });
    const erreurs = await validate(dto);
    expect(erreurs.map((erreur) => erreur.property)).toEqual(
      expect.arrayContaining(["operateur", "telephoneUtilise"]),
    );
    expect(erreurs.some((erreur) => erreur.property === "banqueOuCanal")).toBe(false);
  });

  it("ne demande un motif que pour les décisions non confirmées", async () => {
    const confirme = plainToInstance(PaymentDecisionDto, { statut: PaymentStatus.CONFIRME });
    const rejeteSansMotif = plainToInstance(PaymentDecisionDto, { statut: PaymentStatus.REJETE });
    const rejeteAvecMotif = plainToInstance(PaymentDecisionDto, {
      statut: PaymentStatus.REJETE,
      motif: "La référence ne correspond pas au dossier.",
    });
    expect(await validate(confirme)).toHaveLength(0);
    expect((await validate(rejeteSansMotif)).length).toBeGreaterThan(0);
    expect(await validate(rejeteAvecMotif)).toHaveLength(0);
  });
});
