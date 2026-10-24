import { z } from "zod";
import { EQUIP_SLOTS, WEAPON_EQUIP_SLOTS, ARMOR_EQUIP_SLOTS, type EquipSlot } from "./types";

const ICON_ORIGIN = "https://www.bungie.net/";

const itemRef = z.object({
  id: z.string().min(1).max(64),
  hash: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
  // Solo íconos del CDN de Bungie (o nada): el navegador los carga tal cual.
  icon: z
    .string()
    .max(300)
    .refine((s) => s.startsWith(ICON_ORIGIN), "El ícono debe ser de bungie.net.")
    .nullable(),
  tier: z.enum(["common", "uncommon", "rare", "legendary", "exotic"]),
});

const slotShape = Object.fromEntries(EQUIP_SLOTS.map((s) => [s, itemRef.optional()])) as Record<EquipSlot, z.ZodOptional<typeof itemRef>>;

export const loadoutInputSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1, "Ponle un nombre al loadout.").max(60, "El nombre admite hasta 60 caracteres."),
    classType: z.enum(["titan", "hunter", "warlock"]),
    notes: z.string().trim().max(300).optional(),
    items: z.object(slotShape).strict(),
  })
  .superRefine((value, ctx) => {
    const entries = Object.entries(value.items) as [EquipSlot, z.infer<typeof itemRef> | undefined][];
    const present = entries.filter((e): e is [EquipSlot, z.infer<typeof itemRef>] => e[1] !== undefined);

    if (present.length === 0) {
      ctx.addIssue({ code: "custom", message: "Elige al menos una pieza.", path: ["items"] });
    }

    const ids = present.map(([, ref]) => ref.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "La misma pieza no puede ocupar dos ranuras.", path: ["items"] });
    }

    // El juego solo permite una exótica de arma y una de armadura equipadas a la vez.
    const exotics = (slots: readonly EquipSlot[]) => present.filter(([s, r]) => slots.includes(s) && r.tier === "exotic");
    if (exotics(WEAPON_EQUIP_SLOTS).length > 1) {
      ctx.addIssue({ code: "custom", message: "Solo puede haber una arma exótica en un loadout.", path: ["items"] });
    }
    if (exotics(ARMOR_EQUIP_SLOTS).length > 1) {
      ctx.addIssue({ code: "custom", message: "Solo puede haber una armadura exótica en un loadout.", path: ["items"] });
    }
  });

export type ValidLoadoutInput = z.infer<typeof loadoutInputSchema>;

/** Lo que se lee del disco: un loadout completo ya guardado. */
export const storedLoadoutSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  classType: z.enum(["titan", "hunter", "warlock"]),
  notes: z.string().max(300).optional(),
  items: z.object(slotShape).strict(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
