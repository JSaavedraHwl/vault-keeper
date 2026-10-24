import { redirect } from "next/navigation";
import { hasValidSession } from "@/lib/bungie/session";
import { SLOT_BY_BUCKET, ITEM_TYPE_WEAPON } from "@/lib/inventory/constants";
import { loadProfile } from "@/lib/classify/profile-store";
import { getManifest } from "@/lib/manifest";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

const WEAPON_SLOTS = new Set(["kinetic", "energy", "power"]);

export default async function ProfilePage() {
  if (!(await hasValidSession())) redirect("/?error=expired");

  const [{ profile, warning }, manifest] = await Promise.all([loadProfile(), getManifest()]);

  // Tipos de arma reales del juego (en español), para no depender de texto escrito a mano.
  const weaponTypes = [
    ...new Set(
      Object.values(manifest.items)
        .filter(
          (i) =>
            i.itemType === ITEM_TYPE_WEAPON &&
            i.tierType >= 5 &&
            i.itemTypeDisplayName &&
            i.bucketHash !== undefined &&
            WEAPON_SLOTS.has(SLOT_BY_BUCKET[i.bucketHash]),
        )
        .map((i) => i.itemTypeDisplayName as string),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <main className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Perfil de uso</h1>
        <a href="/vault" className="text-sm text-blue-400 hover:underline">
          ← Volver al alijo
        </a>
      </header>
      {warning && (
        <p className="mb-4 rounded border border-yellow-500 bg-yellow-950/40 p-3 text-sm text-yellow-200">
          {warning}
        </p>
      )}
      <ProfileForm initial={profile} weaponTypes={weaponTypes} />
    </main>
  );
}
