import { NextRequest, NextResponse } from "next/server";
import {
  apiError,
  isSameOriginRequest,
  requestJson,
  setAdminSessionCookie,
} from "../../../../../lib/admin-auth";
import {
  authenticatePassword,
  createAdminSession,
} from "@workspace/db";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  try {
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ipAddress = forwardedFor || request.headers.get("x-real-ip") || "unknown";
    const account = await authenticatePassword(await requestJson(request), ipAddress);
    const session = await createAdminSession(account.userId);
    await setAdminSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return apiError(error, "Sign-in could not be completed.");
  }
}
