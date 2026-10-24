import { getProfile, type DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { getMembershipDataForCurrentUser } from "bungie-api-ts/user";
import { createHttpClient } from "./client";
import { BungieError } from "./errors";

async function resolveMembership(http: ReturnType<typeof createHttpClient>) {
  const { Response: user } = await getMembershipDataForCurrentUser(http);
  // Con cross-save, primaryMembershipId indica la cuenta "principal".
  const membership =
    user.destinyMemberships.find((m) => m.membershipId === user.primaryMembershipId) ??
    user.destinyMemberships[0];
  if (!membership) {
    throw new BungieError("Tu cuenta de Bungie no tiene ninguna cuenta de Destiny 2 vinculada.");
  }
  return membership;
}

export interface DestinyContext {
  membershipType: number;
  membershipId: string;
  /** Personajes, del jugado más recientemente al más antiguo. */
  characterIds: string[];
}

/** Datos mínimos de la cuenta para ejecutar acciones (una petición ligera). */
export async function getDestinyContext(accessToken: string): Promise<DestinyContext> {
  const http = createHttpClient(accessToken);
  const membership = await resolveMembership(http);
  const { Response } = await getProfile(http, {
    destinyMembershipId: membership.membershipId,
    membershipType: membership.membershipType,
    components: [200], // Characters
  });
  const characters = Object.values(Response.characters?.data ?? {}).sort(
    (a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed),
  );
  if (characters.length === 0) throw new BungieError("No se encontraron personajes en tu cuenta.");
  return {
    membershipType: membership.membershipType,
    membershipId: membership.membershipId,
    characterIds: characters.map((c) => c.characterId),
  };
}

/** Perfil de Destiny 2 del usuario con todo lo necesario para leer el alijo. */
export async function getDestinyProfile(accessToken: string): Promise<DestinyProfileResponse> {
  const http = createHttpClient(accessToken);
  const membership = await resolveMembership(http);

  const { Response } = await getProfile(http, {
    destinyMembershipId: membership.membershipId,
    membershipType: membership.membershipType,
    // Valores de DestinyComponentType (es un `const enum`, no importable con isolatedModules).
    components: [
      200, // Characters
      102, // ProfileInventories (alijo)
      201, // CharacterInventories
      205, // CharacterEquipment
      300, // ItemInstances
      304, // ItemStats
      305, // ItemSockets
    ],
  });
  return Response;
}
