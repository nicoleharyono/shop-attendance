import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "attendance_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function sessionSignature(timestamp: string) {
  return createHmac("sha256", process.env.ATTENDANCE_PIN ?? "missing-pin")
    .update(timestamp)
    .digest("base64url");
}

export function isPinConfigured() {
  return Boolean(process.env.ATTENDANCE_PIN);
}

export function isValidPin(pin: unknown) {
  return typeof pin === "string" && Boolean(process.env.ATTENDANCE_PIN) && pin === process.env.ATTENDANCE_PIN;
}

export function createSessionToken() {
  const timestamp = String(Date.now());
  return `${timestamp}.${sessionSignature(timestamp)}`;
}

export function isValidSessionToken(token: string | undefined) {
  if (!token) return false;
  const [timestamp, signature] = token.split(".");
  if (!timestamp || !signature || Date.now() - Number(timestamp) > SESSION_TTL_SECONDS * 1000) return false;
  const expected = sessionSignature(timestamp);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function hasSession() {
  const store = await cookies();
  return isValidSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}
