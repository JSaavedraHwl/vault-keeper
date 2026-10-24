import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { destroySession, refreshSession } from "@/lib/bungie/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = new URL(env.redirectUri).origin;
  // Solo rutas internas, para evitar open redirects.
  const next = req.nextUrl.searchParams.get("next") ?? "/vault";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/vault";

  try {
    await refreshSession();
  } catch {
    await destroySession();
    return NextResponse.redirect(new URL("/?error=expired", origin));
  }
  return NextResponse.redirect(new URL(target, origin));
}
