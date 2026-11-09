import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env.js";

type Kind = "customer" | "staff";

const BASE: Record<Kind, string> = { customer: "ar_customer", staff: "ar_staff" };
const TTL_DAYS: Record<Kind, number> = { customer: 60, staff: 14 };

/**
 * Deployed: `__Host-` cookies. Browsers only accept them over HTTPS, for this exact host,
 * on path "/", with no Domain, so another subdomain or a network attacker cannot plant one.
 */
const cookieName = (kind: Kind) => (env.secureCookies ? `__Host-${BASE[kind]}` : BASE[kind]);

export type SessionClaims = { sub: string; v?: number };

export async function issueSession(c: Context, kind: Kind, claims: SessionClaims) {
  const days = TTL_DAYS[kind];
  const token = await new SignJWT({ v: claims.v })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer("ananth-residency")
    .setAudience(kind)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(env.sessionSecret);
  setCookie(c, cookieName(kind), token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: kind === "staff" ? "Strict" : "Lax",
    path: "/",
    maxAge: days * 86_400,
  });
}

export async function readSession(c: Context, kind: Kind): Promise<SessionClaims | null> {
  const token = getCookie(c, cookieName(kind));
  if (!token || token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret, {
      audience: kind,
      issuer: "ananth-residency",
      algorithms: ["HS256"],
    });
    if (!payload.sub || !/^\d{1,10}$/.test(payload.sub)) return null;
    return { sub: payload.sub, v: typeof payload.v === "number" ? payload.v : undefined };
  } catch {
    return null;
  }
}

export function clearSession(c: Context, kind: Kind) {
  deleteCookie(c, cookieName(kind), { path: "/", secure: env.secureCookies });
}
