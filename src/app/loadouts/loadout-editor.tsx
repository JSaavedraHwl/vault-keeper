"use client";

import { useMemo, useState, useTransition } from "react";
import { ItemIcon, Power } from "@/components/item-bits";
import type { CharacterInfo, NormalizedItem } from "@/lib/inventory/types";
import { candidatesFor, draftFromEquipped, dropOtherClassArmor, withSlot, type DraftItems } from "@/lib/loadouts/draft";
import {
  ARMOR_EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  WEAPON_EQUIP_SLOTS,
  type EquipSlot,
  type Loadout,
  type LoadoutClass,
} from "@/lib/loadouts/types";
import { saveLoadoutAction } from "./actions";

export interface EditorInit {
  id?: string;
  name: string;
  classType: LoadoutClass;
  notes: string;
  items: DraftItems;
}

export const CLASS_LABELS: Record<LoadoutClass, string> = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" };
const MAX_VISIBLE = 80;

export function LoadoutEditor(props: {
  /** Armas y armaduras conocidas (alijo y personajes). */
  items: NormalizedItem[];
  /** Personaje elegido arriba: de él se toma «lo que llevo puesto». */
  character?: CharacterInfo;
  characters: CharacterInfo[];
  init: EditorInit;
  onSaved: (loadout: Loadout) => void;
  onCancel: () => void;
}) {
  const { items, character, init } = props;
  const [name, setName] = useState(init.name);
  const [classType, setClassType] = useState<LoadoutClass>(init.classType);
  const [notes, setNotes] = useState(init.notes);
  const [draft, setDraft] = useState<DraftItems>(init.items);
  const [pickerSlot, setPickerSlot] = useState<EquipSlot | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const candidates = useMemo(
    () => (pickerSlot ? candidatesFor(pickerSlot, classType, items, draft, query) : []),
    [pickerSlot, classType, items, draft, query],
  );
  const charName = (id?: string) => (id ? CLASS_LABELS[props.characters.find((c) => c.id === id)?.classType ?? "titan"] : "");

  function changeClass(next: LoadoutClass) {
    const { draft: kept, dropped } = dropOtherClassArmor(draft, next, items);
    setClassType(next);
    setDraft(kept);
    setInfo(dropped > 0 ? `Se quitaron ${dropped} ${dropped === 1 ? "armadura" : "armaduras"} de otra clase.` : null);
    setPickerSlot(null);
  }

  function fillFromEquipped() {
    if (!character) return;
    setClassType(character.classType);
    setDraft(draftFromEquipped(items, character.id));
    setInfo(`Se copió lo que lleva puesto tu ${CLASS_LABELS[character.classType]}.`);
    setPickerSlot(null);
  }

  function save() {
    setError(null);
    startSave(async () => {
      const result = await saveLoadoutAction({
        ...(init.id && { id: init.id }),
        name,
        classType,
        ...(notes.trim() && { notes }),
        items: draft,
      });
      if (result.ok) props.onSaved(result.loadout);
      else setError(result.error);
    });
  }

  return (
    <section aria-label="Editor de loadout" className="panel mb-8 space-y-5 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <p className="eyebrow mb-1">{init.id ? "Editando" : "Nuevo loadout"}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Nombre (p. ej. Grandmaster – Barrera)"
            aria-label="Nombre del loadout"
            className="field display w-[22rem] max-w-full !text-lg"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="eyebrow">Clase</span>
          <select value={classType} onChange={(e) => changeClass(e.target.value as LoadoutClass)} className="field" aria-label="Clase">
            {(Object.keys(CLASS_LABELS) as LoadoutClass[]).map((c) => (
              <option key={c} value={c}>{CLASS_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <button onClick={fillFromEquipped} disabled={!character} className="btn btn-sm" title="Copia lo que lleva puesto el personaje elegido arriba">
          Rellenar con lo que llevo puesto
        </button>
      </div>

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        maxLength={300}
        placeholder="Notas (opcional)"
        aria-label="Notas"
        className="field w-full"
      />

      {info && <p className="text-xs text-sky-300">ℹ {info}</p>}

      <div className="grid gap-6 lg:grid-cols-[3fr_5fr]">
        {[
          { title: "Armas", slots: WEAPON_EQUIP_SLOTS },
          { title: "Armadura", slots: ARMOR_EQUIP_SLOTS },
        ].map((group) => (
          <div key={group.title}>
            <p className="eyebrow mb-2">{group.title}</p>
            <div className={`grid gap-2.5 ${group.title === "Armas" ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
              {group.slots.map((slot) => {
                const ref = draft[slot];
                const known = ref ? byId.get(ref.id) : undefined;
                const open = pickerSlot === slot;
                return (
                  <div
                    key={slot}
                    className={`item-card flat p-2.5 ${open ? "!border-gold" : ""}`}
                    data-tier={ref?.tier ?? "common"}
                    data-selected={open}
                  >
                    <p className="eyebrow mb-1.5 flex items-center justify-between">
                      {EQUIP_SLOT_LABELS[slot]}
                      {ref && !known && <span className="text-red-300">ya no existe</span>}
                    </p>
                    <div className="flex items-center gap-2.5">
                      {ref ? <ItemIcon icon={ref.icon} size={44} /> : <span className="icon-frame grid place-items-center text-zinc-600" style={{ width: 44, height: 44 }}>＋</span>}
                      <p className="item-name display min-w-0 flex-1 text-sm leading-tight text-white">
                        {ref ? ref.name : <span className="text-zinc-500">Vacía</span>}
                      </p>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => { setPickerSlot(open ? null : slot); setQuery(""); }} className="btn btn-sm" aria-expanded={open}>
                        {ref ? "Cambiar" : "Elegir"}
                      </button>
                      {ref && (
                        <button onClick={() => setDraft((d) => withSlot(d, slot, null))} className="btn btn-sm btn-quiet" aria-label={`Quitar ${EQUIP_SLOT_LABELS[slot]}`}>
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {pickerSlot && (
        <div className="panel-quiet p-4" aria-label={`Elegir ${EQUIP_SLOT_LABELS[pickerSlot]}`}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="display text-lg text-white">Elegir · {EQUIP_SLOT_LABELS[pickerSlot]}</p>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre…" className="field w-56" aria-label="Buscar pieza" autoFocus />
            <span className="text-xs text-zinc-500">{candidates.length} piezas</span>
            <button onClick={() => setPickerSlot(null)} className="btn btn-sm btn-quiet ml-auto">Cerrar</button>
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay piezas para esta ranura{!WEAPON_EQUIP_SLOTS.includes(pickerSlot) ? ` de ${CLASS_LABELS[classType]}` : ""}.</p>
          ) : (
            <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.slice(0, MAX_VISIBLE).map(({ item, blockedReason }) => (
                <li key={item.id}>
                  <button
                    disabled={blockedReason !== null}
                    title={blockedReason ?? undefined}
                    onClick={() => { setDraft((d) => withSlot(d, pickerSlot, item)); setPickerSlot(null); }}
                    data-tier={item.tier}
                    className="item-card flat flex w-full items-center gap-2.5 p-2 text-left disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ItemIcon icon={item.icon} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="item-name display block truncate text-sm text-white">{item.name}</span>
                      <span className="block truncate text-[0.7rem] text-zinc-400">
                        {item.element ? `${item.element} · ` : ""}{item.location === "vault" ? "En el alijo" : `${charName(item.characterId)}${item.equipped ? " · equipada" : ""}`}
                      </span>
                    </span>
                    <Power value={item.power} className="text-sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {candidates.length > MAX_VISIBLE && <p className="mt-2 text-xs text-zinc-500">Mostrando {MAX_VISIBLE} de {candidates.length}: usa el buscador para acotar.</p>}
        </div>
      )}

      {error && <p className="border border-red-500/60 bg-red-950/40 p-3 text-sm text-red-200" role="alert">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving} className="btn btn-gold">{saving ? "Guardando…" : init.id ? "Guardar cambios" : "Guardar loadout"}</button>
        <button onClick={props.onCancel} className="btn btn-quiet">Cancelar</button>
      </div>
    </section>
  );
}
