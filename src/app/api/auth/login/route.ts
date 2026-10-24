import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/bungie/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // la vuelta desde bungie.net es una navegación top-level GET
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
