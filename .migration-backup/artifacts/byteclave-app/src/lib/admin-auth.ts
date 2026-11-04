import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { hasPermission, type RoleCode } from "@workspace/domain";
import { getAdminSession, type AdminSession } from "@workspace/db";

export const ADMIN_SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-byteclave_admin_session"
    : "byteclave_admin_session";

export async function currentAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return getAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function requireAdminPageSession(): Promise<AdminSession> {
  const session = await currentAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasPermission(session.permissions, "admin:access")) redirect("/admin/login?denied=1");
  return session;
}

export async function requireApiPermission(
  permission: string,
): Promise<{ session: AdminSession; response?: never } | { session?: never; response: NextResponse }> {
  const session = await currentAdminSession();
  if (!session) {
    return {
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }
  if (!hasPermission(session.permissions, permission)) {
    return {
      response: NextResponse.json({ error: "Access denied." }, { status: 403 }),
    };
  }
  return { session };
}

export function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const expectedHosts = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    request.nextUrl.host,
  ]
    .flatMap((value) => value?.split(",") ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return expectedHosts.includes(originHost);
}

export async function setAdminSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}

export function actorFromSession(session: AdminSession): {
  userId: string;
  email: string;
  roles: RoleCode[];
  permissions: string[];
} {
  return {
    userId: session.userId,
    email: session.email,
    roles: session.roles,
    permissions: session.permissions,
  };
}

export async function requestJson(request: NextRequest): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) throw new Error("Request is too large.");
  const text = await request.text();
  if (text.length > 16_384) throw new Error("Request is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function apiError(error: unknown, fallback = "The request could not be completed."): NextResponse {
  const message =
    error instanceof Error && error.message.length < 240
      ? error.message
      : fallback;
  const isValidation = error instanceof Error && error.name === "ZodError";
  const isPermission = error instanceof Error && error.name === "PermissionDeniedError";
  const isRateLimited = error instanceof Error && error.name === "LoginRateLimitError";
  const isAuth = error instanceof Error && error.name === "InvalidCredentialsError";
  return NextResponse.json(
    { error: isValidation || isPermission || isRateLimited || isAuth ? message : fallback },
    { status: isValidation ? 400 : isPermission ? 403 : isRateLimited ? 429 : isAuth ? 401 : 400 },
  );
}
