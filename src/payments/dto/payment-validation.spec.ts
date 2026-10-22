import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PaymentMethod, PaymentStatus } from "../../database/enums";
import { CreatePaymentDto } from "./create-payment.dto";
import { PaymentDecisionDto } from "./payment-decision.dto";

describe("validation des déclarations et décisions de paiement", () => {
  it("accepte une déclaration de virement sans prétendre vérifier un transfert", async () => {
    const dto = plainToInstance(CreatePaymentDto, {
      obligationId: "00000000-0000-4000-8000-000000000001",
      mode: PaymentMethod.BANK_TRANSFER,
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
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["operateur", "telephoneUtilise"]),
    );
    expect(errors.some((error) => error.property === "banqueOuCanal")).toBe(false);
  });

  it("ne demande un motif que pour les décisions non confirmées", async () => {
    const confirmed = plainToInstance(PaymentDecisionDto, { statut: PaymentStatus.CONFIRMED });
    const rejectedWithoutReason = plainToInstance(PaymentDecisionDto, { statut: PaymentStatus.REJECTED });
    const rejectedWithReason = plainToInstance(PaymentDecisionDto, {
      statut: PaymentStatus.REJECTED,
      motif: "La référence ne correspond pas au dossier.",
    });
    expect(await validate(confirmed)).toHaveLength(0);
    expect((await validate(rejectedWithoutReason)).length).toBeGreaterThan(0);
    expect(await validate(rejectedWithReason)).toHaveLength(0);
  });
});
