import { BadRequestException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { HttpErrorFilter } from "./http-error.filter";

function hoteFactice() {
  const corps: { statut?: number; json?: unknown } = {};
  const reponse = {
    headersSent: false,
    status(statut: number) {
      corps.statut = statut;
      return this;
    },
    json(valeur: unknown) {
      corps.json = valeur;
      return this;
    },
  };
  const hote = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/auth/inscription",
        originalUrl: "/auth/inscription",
      }),
      getResponse: () => reponse,
    }),
  } as unknown as ArgumentsHost;
  return { hote, corps };
}

describe("HttpErrorFilter", () => {
  it("renvoie { statusCode, message, errors, timestamp } pour une validation", () => {
    const { hote, corps } = hoteFactice();
    new HttpErrorFilter().catch(
      new BadRequestException({
        message: "Données invalides.",
        errors: { courriel: ["Adresse e-mail invalide."] },
      }),
      hote,
    );
    expect(corps.statut).toBe(400);
    expect(corps.json).toMatchObject({
      statusCode: 400,
      message: "Données invalides.",
      errors: { courriel: ["Adresse e-mail invalide."] },
    });
    const json = corps.json as Record<string, unknown>;
    expect(typeof json.timestamp).toBe("string");
    expect(json).not.toHaveProperty("chemin");
    expect(json).not.toHaveProperty("horodatage");
  });

  it("masque le détail d'une erreur interne derrière un message générique", () => {
    const { hote, corps } = hoteFactice();
    new HttpErrorFilter().catch(new Error("mot de passe base: secret"), hote);
    expect(corps.statut).toBe(500);
    expect(corps.json).toMatchObject({
      statusCode: 500,
      message: "Une erreur interne est survenue. Réessayez plus tard.",
    });
    expect(JSON.stringify(corps.json)).not.toContain("secret");
  });
});
