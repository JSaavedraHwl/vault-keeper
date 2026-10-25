import { notFound } from "next/navigation";
import { CleanupView } from "@/app/cleanup/cleanup-view";
import { ProfileForm } from "@/app/cleanup/profile/profile-form";
import { GearView } from "@/app/gear/gear-view";
import { LoadoutsView } from "@/app/loadouts/loadouts-view";
import { VaultView } from "@/app/vault/vault-view";
import { DEFAULT_PROFILE } from "@/lib/classify/profile";
import { previewCleanup, previewGear, previewLoadouts, previewVaultItems, previewWeaponTypes } from "@/lib/dev/preview-data";

export const dynamic = "force-dynamic";

/** Solo desarrollo: muestra cada pantalla con datos de ejemplo, sin sesión, para revisar el diseño. */
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view } = await searchParams;

  switch (view) {
    case "gear":
      return <GearView data={await previewGear()} />;
    case "gear-selected": {
      // Con un arma elegida (la primera exótica del alijo) para ver la barra inferior.
      const data = await previewGear();
      const pick = data.items.find((i) => i.location === "vault" && i.tier === "exotic") ?? data.items.find((i) => i.location === "vault");
      return <GearView data={data} initialSelectedId={pick?.id} />;
    }
    case "loadouts": {
      const { data, loadouts } = await previewLoadouts();
      return <LoadoutsView data={data} loadouts={loadouts} />;
    }
    case "loadouts-equip": {
      const { data, loadouts } = await previewLoadouts();
      return <LoadoutsView data={data} loadouts={loadouts} initialEquipId={loadouts[0].id} />;
    }
    case "loadouts-editor": {
      const { data, loadouts } = await previewLoadouts();
      const l = loadouts[0];
      return (
        <LoadoutsView
          data={data}
          loadouts={loadouts}
          initialEditing={{ id: l.id, name: l.name, classType: l.classType, notes: l.notes ?? "", items: l.items }}
        />
      );
    }
    case "vault":
      return <VaultView items={await previewVaultItems()} />;
    case "cleanup":
      return <CleanupView simulate initialData={await previewCleanup()} />;
    case "profile":
      return (
        <main className="mx-auto max-w-5xl p-4">
          <h1 className="text-2xl font-bold">Perfil de uso</h1>
          <ProfileForm initial={{ ...DEFAULT_PROFILE, version: 2 }} weaponTypes={await previewWeaponTypes()} />
        </main>
      );
    default:
      notFound();
  }
}
