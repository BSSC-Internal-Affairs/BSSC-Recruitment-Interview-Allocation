import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { ApiError } from "./errors";
import { pool } from "./db";
export const cookieName = "bssc_admin";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new ApiError(503, "Admin authentication is not configured.");
  return s;
}
function equal(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function sessionToken() {
  const payload = Buffer.from(
    JSON.stringify({ expires: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}
export async function isAuthenticated() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return false;
  try {
    const [p, s] = token.split(".");
    return (
      !!s &&
      equal(s, createHmac("sha256", secret()).update(p).digest("base64url")) &&
      JSON.parse(Buffer.from(p, "base64url").toString()).expires > Date.now()
    );
  } catch {
    return false;
  }
}
export async function requireAdmin() {
  if (!(await isAuthenticated()))
    throw new ApiError(401, "Please sign in to continue.");
}
export async function login(username: string, password: string) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)
    throw new ApiError(503, "Admin credentials are not configured.");
  secret();
  const {
    rows: [attempt],
  } = await pool.query(
    `INSERT INTO login_attempts(key,attempts,window_start) VALUES ('admin',1,now()) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
  );
  if (attempt.attempts > 10)
    throw new ApiError(
      429,
      "Too many login attempts. Try again in 15 minutes.",
    );
  const validUser = equal(username, process.env.ADMIN_USERNAME),
    validPassword = equal(password, process.env.ADMIN_PASSWORD);
  if (!validUser || !validPassword)
    throw new ApiError(401, "Incorrect username or password.");
  await pool.query("DELETE FROM login_attempts WHERE key='admin'");
  (await cookies()).set(cookieName, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}
