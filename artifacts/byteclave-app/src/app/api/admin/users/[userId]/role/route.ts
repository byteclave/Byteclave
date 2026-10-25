import { NextRequest, NextResponse } from "next/server";
import { changeManagedUserRole } from "@workspace/db";
import {
  actorFromSession,
  apiError,
  isSameOriginRequest,
  requestJson,
  requireApiPermission,
} from "../../../../../../lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const access = await requireApiPermission("users:manage");
  if (access.response) return access.response;
  try {
    const { userId } = await context.params;
    const body = await requestJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid role request." }, { status: 400 });
    }
    const result = await changeManagedUserRole(
      { ...(body as Record<string, unknown>), userId },
      actorFromSession(access.session),
    );
    return NextResponse.json({ ok: true, role: result });
  } catch (error) {
    return apiError(error, "Role could not be changed.");
  }
}
