import { BungieError, MaintenanceError, NeedsRefreshError, SessionExpiredError } from "../errors";

export type ActionErrorKind =
  | "no_room" // el destino no tiene espacio
  | "in_activity" // el jugador está en una actividad donde Bungie bloquea la acción
  | "throttle" // límite de peticiones o del servidor de juego (se reintenta)
  | "not_found" // el ítem ya no existe o cambió de sitio
  | "equipped" // el ítem está equipado
  | "locked" // el ítem tiene candado
  | "not_transferable"
  | "cannot_equip" // el juego no deja equiparlo (exótica ya equipada, nivel, desbloqueo...)
  | "maintenance"
  | "session" // sesión caducada o token inválido
  | "scope" // la app no tiene el permiso de mover/equipar
  | "unknown";

export interface ActionError {
  kind: ActionErrorKind;
  /** Código de error de Bungie, si lo hay. */
  code?: number;
  message: string;
}

/** Errores tras los cuales no tiene sentido seguir con el resto de la cola. */
export const FATAL_KINDS: ReadonlySet<ActionErrorKind> = new Set([
  "in_activity",
  "maintenance",
  "session",
  "scope",
]);

/** Errores que se arreglan reintentando tras una pausa. */
export const RETRYABLE_KINDS: ReadonlySet<ActionErrorKind> = new Set(["throttle"]);

// PlatformErrorCodes de Bungie (ver common.d.ts de bungie-api-ts)
const BY_CODE: Record<number, [ActionErrorKind, string]> = {
  36: ["throttle", "Bungie limitó las peticiones por un momento."],
  51: ["throttle", "Demasiadas peticiones a este endpoint."],
  1672: ["throttle", "El servidor de juego limitó la acción."],
  1637: ["no_room", "El inventario del personaje está lleno."],
  1642: ["no_room", "No hay espacio en el destino."],
  1623: ["not_found", "El ítem ya no está donde se esperaba."],
  1629: ["not_found", "No se encontró el contenedor del ítem."],
  1646: ["not_found", "El ítem no está en el origen indicado."],
  1632: ["not_found", "El ítem ya estaba en el destino."],
  1656: ["equipped", "El ítem está equipado."],
  1674: ["locked", "El ítem tiene candado."],
  1660: ["not_transferable", "Este ítem no se puede transferir."],
  1673: ["not_transferable", "Este ítem no se puede transferir (tiene efectos secundarios)."],
  1641: ["cannot_equip", "El juego no permite equiparla: ya llevas otra exótica equipada."],
  1648: ["cannot_equip", "El juego no permite equiparla: ya llevas otra exótica equipada."],
  1640: ["cannot_equip", "Este ítem no se puede equipar."],
  1638: ["cannot_equip", "El personaje no cumple el nivel necesario para equiparla."],
  1639: ["cannot_equip", "Aún no tienes desbloqueado lo necesario para equiparla."],
  1655: ["in_activity", "Este ítem solo se puede equipar dentro del juego."],
  1671: ["in_activity", "Bungie no permite esta acción mientras estás en una actividad. Vuelve a órbita o a una zona social."],
  1634: ["in_activity", "Esta acción solo se puede hacer en una zona social, en órbita o sin conexión."],
  1635: ["in_activity", "El personaje no está conectado."],
  1654: ["in_activity", "La cuenta debe estar sin conexión para esta acción."],
  5: ["maintenance", "La API de Bungie está en mantenimiento."],
  2108: ["scope", "Tu aplicación no tiene el permiso «Mover o equipar objetos de Destiny». Actívalo en bungie.net y vuelve a iniciar sesión."],
  99: ["session", "Tu sesión expiró."],
  2111: ["session", "Tu sesión expiró."],
  2123: ["session", "Tu sesión expiró."],
  2124: ["session", "Tu sesión fue revocada."],
};

/** Convierte cualquier excepción en un error de acción tipado. */
export function toActionError(err: unknown): ActionError {
  if (err instanceof MaintenanceError) return { kind: "maintenance", code: 5, message: BY_CODE[5][1] };
  if (err instanceof SessionExpiredError || err instanceof NeedsRefreshError) {
    return { kind: "session", message: "Tu sesión expiró. Inicia sesión de nuevo." };
  }
  if (err instanceof BungieError) {
    const known = err.errorCode !== undefined ? BY_CODE[err.errorCode] : undefined;
    if (known) return { kind: known[0], code: err.errorCode, message: known[1] };
    // Errores de red o del servidor de Bungie sin código: se reintentan como límite temporal.
    if (err.errorCode === undefined && (err.httpStatus === undefined || err.httpStatus >= 500)) {
      return { kind: "throttle", message: err.message };
    }
    return { kind: "unknown", code: err.errorCode, message: err.message };
  }
  return { kind: "unknown", message: err instanceof Error ? err.message : "Error desconocido." };
}
