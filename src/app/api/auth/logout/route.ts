import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { destroySession } from "@/lib/bungie/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await destroySession();
  // 303 para que el navegador siga con GET tras el POST.
  return NextResponse.redirect(new URL("/", new URL(env.redirectUri).origin), 303);
}
