export class BungieError extends Error {
  constructor(
    message: string,
    readonly errorCode?: number,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "BungieError";
  }
}

/** Bungie desactivó la API (mantenimiento). */
export class MaintenanceError extends BungieError {
  constructor(message = "La API de Bungie está en mantenimiento.") {
    super(message, 5);
    this.name = "MaintenanceError";
  }
}

/** No hay sesión válida y no se puede recuperar: hay que volver a iniciar sesión. */
export class SessionExpiredError extends Error {
  constructor(message = "Tu sesión expiró. Inicia sesión de nuevo.") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** El access token expiró pero el refresh token sigue vigente: hay que pasar por /api/auth/refresh. */
export class NeedsRefreshError extends Error {
  constructor() {
    super("El access token expiró y debe refrescarse.");
    this.name = "NeedsRefreshError";
  }
}
