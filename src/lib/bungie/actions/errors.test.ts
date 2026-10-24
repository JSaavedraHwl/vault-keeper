import { describe, expect, it } from "vitest";
import { BungieError, MaintenanceError, NeedsRefreshError, SessionExpiredError } from "../errors";
import { FATAL_KINDS, RETRYABLE_KINDS, toActionError } from "./errors";

describe("toActionError", () => {
  it.each([
    [1642, "no_room"],
    [1637, "no_room"],
    [1623, "not_found"],
    [1646, "not_found"],
    [1656, "equipped"],
    [1674, "locked"],
    [1660, "not_transferable"],
    [1671, "in_activity"],
    [1634, "in_activity"],
    [1672, "throttle"],
    [36, "throttle"],
    [2108, "scope"],
    [2111, "session"],
    [99, "session"],
  ] as const)("código %i → %s", (code, kind) => {
    const e = toActionError(new BungieError("x", code, 200));
    expect(e.kind).toBe(kind);
    expect(e.code).toBe(code);
    expect(e.message.length).toBeGreaterThan(5);
  });

  it("mantenimiento y sesión", () => {
    expect(toActionError(new MaintenanceError()).kind).toBe("maintenance");
    expect(toActionError(new SessionExpiredError()).kind).toBe("session");
    expect(toActionError(new NeedsRefreshError()).kind).toBe("session");
  });

  it("fallos de red o del servidor sin código se reintentan", () => {
    expect(toActionError(new BungieError("sin red")).kind).toBe("throttle");
    expect(toActionError(new BungieError("HTTP 503", undefined, 503)).kind).toBe("throttle");
  });

  it("códigos desconocidos y excepciones ajenas son unknown, sin perder el mensaje", () => {
    expect(toActionError(new BungieError("rarísimo", 9999, 200))).toMatchObject({ kind: "unknown", code: 9999, message: "rarísimo" });
    expect(toActionError(new Error("boom"))).toEqual({ kind: "unknown", message: "boom" });
    expect(toActionError("texto")).toMatchObject({ kind: "unknown" });
  });

  it("solo lo que no se arregla reintentando es fatal, y solo throttle se reintenta", () => {
    expect([...FATAL_KINDS].sort()).toEqual(["in_activity", "maintenance", "scope", "session"]);
    expect([...RETRYABLE_KINDS]).toEqual(["throttle"]);
    for (const kind of RETRYABLE_KINDS) expect(FATAL_KINDS.has(kind)).toBe(false);
  });
});
