import { NextRequest, NextResponse } from "next/server";
import {
  acceptAdminInvitation,
  createAdminSession,
} from "@workspace/db";
import {
  apiError,
  isSameOriginRequest,
  requestJson,
  setAdminSessionCookie,
} from "../../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  try {
    const account = await acceptAdminInvitation(await requestJson(request));
    const session = await createAdminSession(account.userId);
    await setAdminSessionCookie(session.token, session.expiresAt);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error, "Invitation could not be accepted.");
  }
}
