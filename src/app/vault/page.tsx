import { redirect } from "next/navigation";
import { BungieError, MaintenanceError, NeedsRefreshError, SessionExpiredError } from "@/lib/bungie/errors";
import { getVaultItems } from "@/lib/inventory/vault";
import type { NormalizedItem } from "@/lib/inventory/types";
import { ErrorPanel } from "./error-panel";
import { VaultView } from "./vault-view";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  let items: NormalizedItem[];
  try {
    items = await getVaultItems();
  } catch (err) {
    // redirect() lanza una excepción especial: se llama fuera del try/catch genérico.
    if (err instanceof NeedsRefreshError) redirect("/api/auth/refresh?next=/vault");
    if (err instanceof SessionExpiredError) redirect("/?error=expired");
    if (err instanceof MaintenanceError) {
      return (
        <ErrorPanel
          title="Bungie en mantenimiento"
          message="La API de Bungie está desactivada temporalmente. Vuelve a intentarlo más tarde."
        />
      );
    }
    if (err instanceof BungieError) {
      return <ErrorPanel title="Error de la API de Bungie" message={err.message} />;
    }
    return (
      <ErrorPanel
        title="No se pudo cargar el alijo"
        message={err instanceof Error ? err.message : "Error desconocido."}
      />
    );
  }

  return <VaultView items={items} />;
}
