import { BungieError, MaintenanceError, SessionExpiredError } from "../errors";
import type { EquipRequest, InventoryActions, LockRequest, TransferRequest } from "./api";

export interface MockItem {
  /** "vault" o un characterId */
  location: string;
  locked: boolean;
  equipped?: boolean;
  /** Ranura de equipo («kinetic», «energy»...): solo hace falta para simular equipar. */
  slot?: string;
  /** Exótica: para simular la regla de «una sola exótica de arma equipada». */
  exotic?: boolean;
}

export interface MockOptions {
  items: Record<string, MockItem>;
  /** Capacidad de ítems por personaje (por defecto, ilimitada). */
  characterCapacity?: Record<string, number>;
  /** Si es false, bloquear un ítem del alijo falla (como podría ocurrir en la API real). */
  vaultLockSupported?: boolean;
  /** Errores a lanzar: por itemId, el código de Bungie (o "maintenance"/"session"). Se consumen `times` veces. */
  failures?: Record<string, { code: number | "maintenance" | "session"; times?: number }>;
}

/** Simula la API de Bungie en memoria. Nunca hace peticiones de red. */
export class MockInventoryActions implements InventoryActions {
  readonly items: Record<string, MockItem>;
  /** Registro de llamadas, en orden. */
  readonly calls: string[] = [];
  private readonly failures;

  constructor(private readonly options: MockOptions) {
    this.items = structuredClone(options.items);
    this.failures = structuredClone(options.failures ?? {});
  }

  /** Una clave `lock:ID`, `transfer:ID` o `equip:ID` afecta solo a esa operación; `ID` a todas. */
  private maybeFail(op: "lock" | "transfer" | "equip", itemId: string) {
    const failure = this.failures[`${op}:${itemId}`] ?? this.failures[itemId];
    if (!failure || (failure.times ?? Infinity) <= 0) return;
    if (failure.times !== undefined) failure.times -= 1;
    if (failure.code === "maintenance") throw new MaintenanceError();
    if (failure.code === "session") throw new SessionExpiredError();
    throw new BungieError(`Error simulado ${failure.code}`, failure.code, 200);
  }

  private count(location: string) {
    return Object.values(this.items).filter((i) => i.location === location).length;
  }

  async transfer(req: TransferRequest): Promise<void> {
    this.calls.push(`transfer:${req.itemId}:${req.toVault ? "->vault" : "->" + req.characterId}`);
    this.maybeFail("transfer", req.itemId);
    const item = this.items[req.itemId];
    if (!item) throw new BungieError("Ítem no encontrado", 1623, 200);
    if (item.equipped) throw new BungieError("Equipado", 1656, 200);

    const from = req.toVault ? req.characterId : "vault";
    if (item.location !== from) throw new BungieError("No está en el origen", 1646, 200);

    const to = req.toVault ? "vault" : req.characterId;
    const capacity = this.options.characterCapacity?.[to];
    if (to !== "vault" && capacity !== undefined && this.count(to) >= capacity) {
      throw new BungieError("Sin espacio", 1642, 200);
    }
    item.location = to;
  }

  async setLock(req: LockRequest): Promise<void> {
    this.calls.push(`lock:${req.itemId}:${req.locked}`);
    this.maybeFail("lock", req.itemId);
    const item = this.items[req.itemId];
    if (!item) throw new BungieError("Ítem no encontrado", 1623, 200);
    if (item.location === "vault" && this.options.vaultLockSupported === false) {
      throw new BungieError("No se puede bloquear en el alijo", 1623, 200);
    }
    item.locked = req.locked;
  }

  async equip(req: EquipRequest): Promise<void> {
    this.calls.push(`equip:${req.itemId}:${req.characterId}`);
    this.maybeFail("equip", req.itemId);
    const item = this.items[req.itemId];
    if (!item) throw new BungieError("Ítem no encontrado", 1623, 200);
    // Como la API real: el ítem debe estar ya en el personaje.
    if (item.location !== req.characterId) throw new BungieError("No está en el personaje", 1623, 200);

    const sameCharacter = Object.entries(this.items).filter(([, i]) => i.location === req.characterId && i.equipped);
    // Una sola exótica de arma equipada (la de la misma ranura se reemplaza, no cuenta).
    if (item.exotic && sameCharacter.some(([, i]) => i.exotic && i.slot !== item.slot)) {
      throw new BungieError("Ya hay una exótica equipada", 1641, 200);
    }
    // Equipar desequipa lo que había en esa ranura.
    for (const [, other] of sameCharacter) if (other.slot === item.slot) other.equipped = false;
    item.equipped = true;
  }
}
