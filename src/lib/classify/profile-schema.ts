import { z } from "zod";
import { ARMOR_STAT_KEYS } from "../inventory/constants";

const activity = z.enum(["pve", "grandmaster", "pvp"]);

const classProfile = z.object({
  enabled: z.boolean(),
  activities: z.array(activity).max(3).refine((a) => new Set(a).size === a.length, "Actividades repetidas."),
  playstyle: z.string().trim().max(300),
  armorStatPriority: z
    .array(z.enum(ARMOR_STAT_KEYS))
    .max(3, "Elige como máximo 3 stats prioritarias.")
    .refine((a) => new Set(a).size === a.length, "Stats repetidas."),
  minArmorTotal: z.number().int().min(0).max(100).optional(),
});

export const usageProfileSchema = z.object({
  version: z.number().int().min(1),
  classes: z.object({ titan: classProfile, hunter: classProfile, warlock: classProfile }),
  weaponPreferences: z.object({
    pve: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
    grandmaster: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
    pvp: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  }),
  favoredPerks: z.array(z.string().trim().min(1).max(80)).max(200),
});

/** Lo que envía el formulario: igual que el perfil, pero sin `version` (la asigna el servidor). */
export const usageProfileInputSchema = usageProfileSchema.omit({ version: true });
