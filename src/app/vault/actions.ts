"use server";

import { BungieInventoryActions, type InventoryActions } from "@/lib/bungie/actions/api";
import { toActionError } from "@/lib/bungie/actions/errors";
import { MockInventoryActions } from "@/lib/bungie/actions/mock";
import { getDestinyContext } from "@/lib/bungie/profile";
import { getAccessToken, hasValidSession } from "@/lib/bungie/session";
import { MOCK_AUDIT_FILE } from "@/lib/actions/audit";
import { loadCapabilities, saveCapabilities } from "@/lib/actions/capabilities";
import { lockSingleItem, type LockSingleResult } from "@/lib/actions/lock-single";
import { VAULT } from "@/lib/actions/types";

/** ACTIONS_MODE=mock: nunca se llama a Bungie (para probar la interfaz sin tocar la cuenta). */
const isMock = () => process.env.ACTIONS_MODE === "mock";

/** Bloquea o desbloquea un ítem concreto del alijo. */
export async function setItemLockAction(
  item: { id: string; hash: number; name: string },
  locked: boolean,
): Promise<LockSingleResult> {
  if (
    typeof item?.id !== "string" ||
    item.id.length === 0 ||
    item.id.length > 64 ||
    !Number.isInteger(item.hash) ||
    typeof locked !== "boolean"
  ) {
    return { ok: false, error: { kind: "unknown", message: "Petición no válida." } };
  }
  if (!(await hasValidSession())) {
    return { ok: false, error: { kind: "session", message: "Tu sesión expiró. Inicia sesión de nuevo." } };
  }
  const safeItem = { id: item.id, hash: item.hash, name: String(item.name ?? "").slice(0, 120) };

  try {
    if (isMock()) {
      const actions: InventoryActions = new MockInventoryActions({
        items: { [safeItem.id]: { location: VAULT, locked: !locked } },
        vaultLockSupported: process.env.ACTIONS_MOCK_VAULT_LOCK !== "0",
      });
      return await lockSingleItem({
        actions,
        item: safeItem,
        locked,
        characterId: "mock-character",
        capabilities: {}, // el mock no aprende nada
        auditFile: MOCK_AUDIT_FILE,
        sleep: async () => {},
      });
    }

    const { accessToken } = await getAccessToken();
    const context = await getDestinyContext(accessToken);
    return await lockSingleItem({
      actions: new BungieInventoryActions(accessToken, context.membershipType),
      item: safeItem,
      locked,
      characterId: context.characterIds[0], // el personaje jugado más recientemente
      capabilities: await loadCapabilities(),
      saveCapabilities,
    });
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
