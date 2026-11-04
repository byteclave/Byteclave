import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  clearAdminSessionCookie,
  currentAdminSession,
  isSameOriginRequest,
} from "../../../../../lib/admin-auth";
import { revokeAdminSession } from "@workspace/db";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const session = await currentAdminSession();
  const cookieStore = await cookies();
  if (session) {
    await revokeAdminSession(
      cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
      session.userId,
    );
  }
  await clearAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
