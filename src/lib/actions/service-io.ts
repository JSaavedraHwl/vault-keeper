import { BungieInventoryActions, type InventoryActions } from "../bungie/actions/api";
import { MockInventoryActions } from "../bungie/actions/mock";
import {
  BungieError,
  MaintenanceError,
  NeedsRefreshError,
  SessionExpiredError,
} from "../bungie/errors";
import { loadOverrides, OVERRIDES_FILE, SIMULATION_OVERRIDES_FILE } from "../classify/overrides";
import { loadProfile } from "../classify/profile-store";
import { analyze } from "../classify/run";
import { loadVaultData } from "../inventory/vault";
import { AUDIT_FILE, lastRun, MOCK_AUDIT_FILE } from "./audit";
import { loadCapabilities } from "./capabilities";
import type { ActionsError } from "./events";
import { PlanError, type PlanContext } from "./service";
import { simActions, simCharacters, simCommit, simVaultItems } from "./sim-world";

/** ACTIONS_MODE=mock: se lee la cuenta real pero las acciones NUNCA llaman a Bungie. */
export const isMockMode = () => process.env.ACTIONS_MODE === "mock";

export interface World {
  ctx: PlanContext;
  actions: InventoryActions;
  auditFile: string;
  /** Datos de ejemplo (sin cuenta) o modo mock: lo que se «hace» no afecta a Bungie. */
  simulated: boolean;
  /** Guarda en el mundo simulado lo que hizo el mock. */
  commit?: () => void;
}

/** Lee el estado actual y lo deja listo para planificar y ejecutar. Siempre datos frescos. */
export async function loadWorld(simulate: boolean): Promise<World> {
  if (simulate) {
    const [{ profile }, overrides] = await Promise.all([loadProfile(), loadOverrides(SIMULATION_OVERRIDES_FILE)]);
    const items = simVaultItems();
    const mock = simActions();
    return {
      ctx: {
        items,
        characters: simCharacters(),
        results: analyze(items, { profile, overrides }).results,
        protectedIds: new Set(overrides.alwaysKeep),
        capabilities: { vaultLock: true },
        lastRun: await lastRun(MOCK_AUDIT_FILE),
      },
      actions: mock,
      auditFile: MOCK_AUDIT_FILE,
      simulated: true,
      commit: () => simCommit(mock),
    };
  }

  const [data, { profile }, overrides, capabilities] = await Promise.all([
    loadVaultData(),
    loadProfile(),
    loadOverrides(OVERRIDES_FILE),
    loadCapabilities(),
  ]);
  const mock = isMockMode();
  const auditFile = mock ? MOCK_AUDIT_FILE : AUDIT_FILE;
  return {
    ctx: {
      items: data.items,
      characters: data.characters,
      results: analyze(data.items, { profile, overrides }).results,
      protectedIds: new Set(overrides.alwaysKeep),
      capabilities,
      lastRun: await lastRun(auditFile),
    },
    actions: mock
      ? new MockInventoryActions({ items: Object.fromEntries(data.items.map((i) => [i.id, { location: "vault", locked: i.locked }])) })
      : new BungieInventoryActions(data.accessToken, data.membershipType),
    auditFile,
    simulated: mock,
  };
}

/** Convierte cualquier error en uno apto para mostrar. */
export function toActionsError(err: unknown): ActionsError {
  if (err instanceof PlanError) return { kind: "plan", message: err.message };
  if (err instanceof BusyError) return { kind: "busy", message: err.message };
  if (err instanceof NeedsRefreshError) return { kind: "refresh", message: "Renovando la sesión…" };
  if (err instanceof SessionExpiredError) return { kind: "expired", message: err.message };
  if (err instanceof MaintenanceError) return { kind: "maintenance", message: err.message };
  if (err instanceof BungieError) return { kind: "bungie", message: err.message };
  return { kind: "other", message: err instanceof Error ? err.message : "Error desconocido." };
}

export class BusyError extends Error {
  constructor() {
    super("Ya hay una ejecución en curso. Espera a que termine.");
  }
}

// Solo una ejecución a la vez en todo el servidor: dos rondas simultáneas podrían pisarse.
const g = globalThis as unknown as { __actionsBusy?: boolean };

/** Ejecuta `fn` con exclusión mutua; si ya hay una ejecución en curso, lanza BusyError. */
export async function withRunLock<T>(fn: () => Promise<T>): Promise<T> {
  if (g.__actionsBusy) throw new BusyError();
  g.__actionsBusy = true;
  try {
    return await fn();
  } finally {
    g.__actionsBusy = false;
  }
}
