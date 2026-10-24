import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { exchangeCode } from "@/lib/bungie/oauth";
import { saveTokens } from "@/lib/bungie/session";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const origin = new URL(env.redirectUri).origin;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/?error=${reason}`, origin));
    res.cookies.delete({ name: "oauth_state", path: "/api/auth" });
    return res;
  };

  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get("oauth_state")?.value;

  if (params.get("error")) return fail("denied");
  if (!code || !state || !expected || !safeEqual(state, expected)) return fail("state");

  try {
    await saveTokens(await exchangeCode(code));
  } catch {
    return fail("token");
  }

  const res = NextResponse.redirect(new URL("/vault", origin));
  res.cookies.delete({ name: "oauth_state", path: "/api/auth" });
  return res;
}
