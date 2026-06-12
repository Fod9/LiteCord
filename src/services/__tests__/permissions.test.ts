import { describe, it, expect } from "vitest";
import {
  ALL_PERMISSION_IDS,
  PERMISSION_CATEGORIES,
  parseApiError,
} from "../permissions";

describe("catalogue de permissions", () => {
  it("chaque permission du catalogue a un id, un label et une description", () => {
    for (const cat of PERMISSION_CATEGORIES) {
      expect(cat.label).toBeTruthy();
      for (const p of cat.permissions) {
        expect(p.id).toMatch(/^[a-z_]+$/);
        expect(p.label).toBeTruthy();
        expect(p.description).toBeTruthy();
      }
    }
  });

  it("ALL_PERMISSION_IDS couvre exactement le catalogue, sans doublon", () => {
    const fromCatalog = PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.id));
    expect(new Set(fromCatalog).size).toBe(fromCatalog.length);
    expect([...ALL_PERMISSION_IDS].sort()).toEqual([...fromCatalog].sort());
  });
});

describe("parseApiError — format JSON stable de l'API", () => {
  it("traduit missing_permission avec le label du catalogue", () => {
    const msg = parseApiError('{"error": "missing_permission", "permission": "manage_channels"}');
    expect(msg).toContain("Gérer les channels");
  });

  it("traduit le format WS missing_permission:<id>", () => {
    const msg = parseApiError("missing_permission:send_messages");
    expect(msg).toContain("Envoyer des messages");
  });

  it("traduit role_hierarchy", () => {
    const msg = parseApiError('{"error": "role_hierarchy"}');
    expect(msg.toLowerCase()).toContain("hiérarchie");
  });

  it("traduit not_member", () => {
    const msg = parseApiError('{"error": "not_member"}');
    expect(msg.toLowerCase()).toContain("membre");
  });

  it("traduit unknown_permissions en listant les valeurs refusées", () => {
    const msg = parseApiError('{"error": "unknown_permissions", "permissions": ["foo", "bar"]}');
    expect(msg).toContain("foo");
    expect(msg).toContain("bar");
  });

  it("retombe sur l'id si la permission est hors catalogue", () => {
    const msg = parseApiError('{"error": "missing_permission", "permission": "future_perm"}');
    expect(msg).toContain("future_perm");
  });

  it("retourne le texte brut pour une erreur non structurée", () => {
    expect(parseApiError("Erreur serveur")).toBe("Erreur serveur");
    expect(parseApiError(new Error("boom"))).toContain("boom");
  });
});
