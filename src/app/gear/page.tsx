import { redirect } from "next/navigation";
import { BungieError, MaintenanceError, NeedsRefreshError, SessionExpiredError } from "@/lib/bungie/errors";
import { loadGearData, type GearData } from "@/lib/inventory/gear";
import { ErrorPanel } from "../vault/error-panel";
import { GearView } from "./gear-view";

export const dynamic = "force-dynamic";

export default async function GearPage() {
  let data: GearData;
  try {
    // El token de acceso y la membresía se quedan en el servidor: al navegador solo va `GearData`.
    const { accessToken: _token, membershipType: _type, ...gear } = await loadGearData();
    void _token;
    void _type;
    data = gear;
  } catch (err) {
    if (err instanceof NeedsRefreshError) redirect("/api/auth/refresh?next=/gear");
    if (err instanceof SessionExpiredError) redirect("/?error=expired");
    if (err instanceof MaintenanceError) {
      return <ErrorPanel title="Bungie en mantenimiento" message="La API de Bungie está desactivada temporalmente. Vuelve a intentarlo más tarde." />;
    }
    if (err instanceof BungieError) return <ErrorPanel title="Error de la API de Bungie" message={err.message} />;
    return <ErrorPanel title="No se pudo cargar el equipo" message={err instanceof Error ? err.message : "Error desconocido."} />;
  }
  return <GearView data={data} />;
}
