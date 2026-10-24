import type { Rule } from "../types";

/** Bloqueado, equipado o marcado "siempre conservar": siempre keep. */
export const protectedRule: Rule = (item, ctx) => {
  if (item.locked) return { verdict: "keep", reason: "Tiene candado en el juego.", confidence: 1 };
  if (item.equipped) return { verdict: "keep", reason: "Está equipado.", confidence: 1 };
  if (ctx.protectedIds.has(item.id)) {
    return { verdict: "keep", reason: "Marcado como «siempre conservar».", confidence: 1 };
  }
  return null;
};

/** Excepciones de la configuración (por hash o nombre exacto). */
export const exceptionsRule: Rule = (item, ctx) => {
  const { hashes, names } = ctx.config.exceptions;
  if (hashes.includes(item.hash) || names.includes(item.name)) {
    return { verdict: "keep", reason: "Está en la lista de excepciones.", confidence: 1 };
  }
  return null;
};
