"use client";

import { useState, useTransition } from "react";
import { ARMOR_STAT_KEYS, type ArmorStatKey } from "@/lib/inventory/constants";
import type { Activity, ClassKey, ClassProfile, UsageProfile } from "@/lib/classify/profile";
import { saveProfileAction } from "./actions";

const CLASS_LABELS: Record<ClassKey, string> = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" };
const ACTIVITY_LABELS: Record<Activity, string> = { pve: "PvE", grandmaster: "Grandmaster", pvp: "PvP" };
const ACTIVITIES = Object.keys(ACTIVITY_LABELS) as Activity[];
const STAT_LABELS: Record<ArmorStatKey, string> = {
  weapons: "Armas",
  health: "Salud",
  class: "Clase",
  grenade: "Granada",
  super: "Superhabilidad",
  melee: "Cuerpo a cuerpo",
};

const toggle = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function ProfileForm({ initial, weaponTypes }: { initial: UsageProfile; weaponTypes: string[] }) {
  const [profile, setProfile] = useState(initial);
  const [perksText, setPerksText] = useState(initial.favoredPerks.join("\n"));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setClass = (key: ClassKey, patch: Partial<ClassProfile>) =>
    setProfile((p) => ({ ...p, classes: { ...p.classes, [key]: { ...p.classes[key], ...patch } } }));

  const setWeaponTypes = (activity: Activity, types: string[]) =>
    setProfile((p) => ({ ...p, weaponPreferences: { ...p.weaponPreferences, [activity]: types } }));

  function save() {
    const { version: _version, ...input } = profile;
    void _version;
    const favoredPerks = perksText.split("\n").map((s) => s.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await saveProfileAction({ ...input, favoredPerks });
      setMessage(
        result.ok
          ? { ok: true, text: `Perfil guardado (versión ${result.version}).` }
          : { ok: false, text: result.error },
      );
      if (result.ok) setProfile((p) => ({ ...p, version: result.version, favoredPerks }));
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {(Object.keys(CLASS_LABELS) as ClassKey[]).map((key) => {
          const c = profile.classes[key];
          return (
            <fieldset key={key} className="space-y-3 rounded border border-zinc-700 bg-zinc-900 p-4">
              <legend className="px-1 font-semibold">{CLASS_LABELS[key]}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.enabled} onChange={(e) => setClass(key, { enabled: e.target.checked })} />
                Juego con esta clase
              </label>

              <div className={c.enabled ? "space-y-3" : "pointer-events-none space-y-3 opacity-40"}>
                <div>
                  <p className="mb-1 text-xs text-zinc-400">Actividades</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {ACTIVITIES.map((a) => (
                      <label key={a} className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={c.activities.includes(a)}
                          onChange={() => setClass(key, { activities: toggle(c.activities, a) })}
                        />
                        {ACTIVITY_LABELS[a]}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs text-zinc-400">Stats prioritarias (máx. 3)</p>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    {ARMOR_STAT_KEYS.map((s) => {
                      const checked = c.armorStatPriority.includes(s);
                      return (
                        <label key={s} className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!checked && c.armorStatPriority.length >= 3}
                            onChange={() => setClass(key, { armorStatPriority: toggle(c.armorStatPriority, s) })}
                          />
                          {STAT_LABELS[s]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-zinc-400">Total mínimo de stats (vacío = global)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={c.minArmorTotal ?? ""}
                    onChange={(e) =>
                      setClass(key, { minArmorTotal: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    className="w-24 rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
                  />
                </label>

                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-zinc-400">Estilo de juego (nota)</span>
                  <input
                    value={c.playstyle}
                    maxLength={300}
                    onChange={(e) => setClass(key, { playstyle: e.target.value })}
                    className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
                  />
                </label>
              </div>
            </fieldset>
          );
        })}
      </section>

      <section className="rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="mb-1 font-semibold">Armas que usas por actividad</h2>
        <p className="mb-3 text-xs text-zinc-400">
          Si marcas alguna, las armas de otros tipos se sugerirán como «archivar». Sin marcar nada, no se aplica.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {ACTIVITIES.map((a) => {
            const selected = profile.weaponPreferences[a] ?? [];
            return (
              <div key={a}>
                <p className="mb-1 text-sm font-medium">{ACTIVITY_LABELS[a]}</p>
                <div className="max-h-56 space-y-1 overflow-y-auto text-sm">
                  {weaponTypes.map((t) => (
                    <label key={t} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={selected.includes(t)}
                        onChange={() => setWeaponTypes(a, toggle(selected, t))}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded border border-zinc-700 bg-zinc-900 p-4">
        <h2 className="mb-1 font-semibold">Perks que valoras</h2>
        <p className="mb-2 text-xs text-zinc-400">
          Uno por línea, con el nombre exacto del juego. Ayudan a elegir la mejor copia de un arma duplicada.
        </p>
        <textarea
          value={perksText}
          onChange={(e) => setPerksText(e.target.value)}
          rows={5}
          className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-sm"
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar perfil"}
        </button>
        <span className="text-xs text-zinc-500">Versión actual: {profile.version}</span>
        {message && (
          <span className={message.ok ? "text-sm text-green-400" : "text-sm text-red-400"}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
