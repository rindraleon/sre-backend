import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";
import {
  buildFieldErrors,
  createValidationException,
} from "./validation-errors";

describe("buildFieldErrors", () => {
  it("indexe les messages par nom de champ", () => {
    const erreurs: ValidationError[] = [
      {
        property: "courriel",
        constraints: { isEmail: "Adresse e-mail invalide." },
      },
      {
        property: "motDePasse",
        constraints: {
          matches: "Le mot de passe doit contenir au moins 10 caractères.",
        },
      },
    ];
    expect(buildFieldErrors(erreurs)).toEqual({
      courriel: ["Adresse e-mail invalide."],
      motDePasse: ["Le mot de passe doit contenir au moins 10 caractères."],
    });
  });

  it("aplati les champs imbriqués avec leur chemin complet", () => {
    const erreurs: ValidationError[] = [
      {
        property: "profil",
        children: [
          {
            property: "telephone",
            constraints: {
              length: "Ce champ doit contenir entre 7 et 40 caractères.",
            },
          },
        ],
      },
    ];
    expect(buildFieldErrors(erreurs)).toEqual({
      "profil.telephone": ["Ce champ doit contenir entre 7 et 40 caractères."],
    });
  });

  it("ignore les erreurs sans contrainte", () => {
    expect(buildFieldErrors([{ property: "nom" }])).toEqual({});
  });
});

describe("createValidationException", () => {
  it("renvoie une BadRequestException au format du contrat d'erreur", () => {
    const exception = createValidationException([
      {
        property: "courriel",
        constraints: { isEmail: "Adresse e-mail invalide." },
      },
    ]);
    expect(exception).toBeInstanceOf(BadRequestException);
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      message: "Données invalides.",
      errors: { courriel: ["Adresse e-mail invalide."] },
    });
  });
});
