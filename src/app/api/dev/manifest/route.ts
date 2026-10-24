import { NextResponse } from "next/server";
import { getManifest } from "@/lib/manifest";

export const dynamic = "force-dynamic";

// Solo para desarrollo: comprueba la descarga/caché del manifest.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "no disponible" }, { status: 404 });
  }
  const t0 = Date.now();
  const m = await getManifest();
  const sample = Object.values(m.items).find((i) => i.tierType === 6 && i.itemTypeDisplayName);
  return NextResponse.json({
    version: m.version,
    language: m.language,
    ms: Date.now() - t0,
    counts: {
      items: Object.keys(m.items).length,
      stats: Object.keys(m.stats).length,
      itemCategories: Object.keys(m.itemCategories).length,
      socketCategories: Object.keys(m.socketCategories).length,
      socketTypes: Object.keys(m.socketTypes).length,
    },
    sample,
    socketCategoryNames: Object.values(m.socketCategories)
      .map((c) => `${c.hash}: ${c.name}`)
      .filter((s) => /perk|ventaja|ventajas/i.test(s)),
  });
}
