import { BadRequestException } from "@nestjs/common";
import type { ValidationError } from "class-validator";

/** Flattens class-validator errors (including nested objects, e.g. */
export function buildFieldErrors(
  errors: ValidationError[],
  prefix = "",
): Record<string, string[]> {
  const byField: Record<string, string[]> = {};
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const messages = error.constraints
      ? Object.values(error.constraints)
      : [];
    if (messages.length) {
      byField[path] = [...(byField[path] ?? []), ...messages];
    }
    if (error.children?.length) {
      Object.assign(byField, buildFieldErrors(error.children, path));
    }
  }
  return byField;
}

/** Validation exception in the shape consumed by the global filter and the frontend. */
export function createValidationException(errors: ValidationError[]) {
  return new BadRequestException({
    message: "Données invalides.",
    errors: buildFieldErrors(errors),
  });
}
