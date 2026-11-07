import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env.js";

type Kind = "customer" | "staff";

const COOKIE: Record<Kind, string> = { customer: "ar_customer", staff: "ar_staff" };
const TTL_DAYS: Record<Kind, number> = { customer: 90, staff: 30 };

export type SessionClaims = { sub: string; v?: number };

export async function issueSession(c: Context, kind: Kind, claims: SessionClaims) {
  const days = TTL_DAYS[kind];
  const token = await new SignJWT({ v: claims.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setAudience(kind)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(env.sessionSecret);
  setCookie(c, COOKIE[kind], token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "Lax",
    path: "/",
    maxAge: days * 86_400,
  });
}

export async function readSession(c: Context, kind: Kind): Promise<SessionClaims | null> {
  const token = getCookie(c, COOKIE[kind]);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, { audience: kind, algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, v: typeof payload.v === "number" ? payload.v : undefined };
  } catch {
    return null;
  }
}

export function clearSession(c: Context, kind: Kind) {
  deleteCookie(c, COOKIE[kind], { path: "/", secure: env.secureCookies });
}
