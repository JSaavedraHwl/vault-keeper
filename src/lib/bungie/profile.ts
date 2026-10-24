import { getProfile, type DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { getMembershipDataForCurrentUser } from "bungie-api-ts/user";
import { createHttpClient } from "./client";
import { BungieError } from "./errors";

/** Perfil de Destiny 2 del usuario con todo lo necesario para leer el alijo. */
export async function getDestinyProfile(accessToken: string): Promise<DestinyProfileResponse> {
  const http = createHttpClient(accessToken);

  const { Response: user } = await getMembershipDataForCurrentUser(http);
  // Con cross-save, primaryMembershipId indica la cuenta "principal".
  const membership =
    user.destinyMemberships.find((m) => m.membershipId === user.primaryMembershipId) ??
    user.destinyMemberships[0];
  if (!membership) {
    throw new BungieError("Tu cuenta de Bungie no tiene ninguna cuenta de Destiny 2 vinculada.");
  }

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
