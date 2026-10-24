import { equipItem, setItemLockState, transferItem } from "bungie-api-ts/destiny2";
import { createHttpClient } from "../client";

export interface TransferRequest {
  /** itemInstanceId */
  itemId: string;
  itemHash: number;
  stackSize: number;
  /** true: personaje → alijo; false: alijo → personaje. */
  toVault: boolean;
  /** Personaje origen (si toVault) o destino (si no). */
  characterId: string;
}

export interface LockRequest {
  itemId: string;
  /** Personaje con el que se hace la llamada (la API lo exige). */
  characterId: string;
  locked: boolean;
}

export interface EquipRequest {
  /** itemInstanceId; ya debe estar en el personaje. */
  itemId: string;
  characterId: string;
}

/** Operaciones sobre el inventario. Las implementaciones lanzan excepciones; el ejecutor las tipa. */
export interface InventoryActions {
  transfer(req: TransferRequest): Promise<void>;
  setLock(req: LockRequest): Promise<void>;
  /** Equipa un ítem que ya está en el personaje (solo en zona social, órbita o sin conexión). */
  equip(req: EquipRequest): Promise<void>;
}

/** Implementación real contra la API de Bungie. */
export class BungieInventoryActions implements InventoryActions {
  private readonly http;

  constructor(
    accessToken: string,
    private readonly membershipType: number,
  ) {
    this.http = createHttpClient(accessToken);
  }

  async transfer(req: TransferRequest): Promise<void> {
    await transferItem(this.http, {
      itemReferenceHash: req.itemHash,
      stackSize: req.stackSize,
      transferToVault: req.toVault,
      itemId: req.itemId,
      characterId: req.characterId,
      membershipType: this.membershipType,
    });
  }

  async setLock(req: LockRequest): Promise<void> {
    await setItemLockState(this.http, {
      state: req.locked,
      itemId: req.itemId,
      characterId: req.characterId,
      membershipType: this.membershipType,
    });
  }

  async equip(req: EquipRequest): Promise<void> {
    await equipItem(this.http, {
      itemId: req.itemId,
      characterId: req.characterId,
      membershipType: this.membershipType,
    });
  }
}
