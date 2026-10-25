import { NextRequest, NextResponse } from "next/server";
import {
  actorFromSession,
  apiError,
  isSameOriginRequest,
  requestJson,
  requireApiPermission,
} from "../../../../lib/admin-auth";
import { updateOwnCredentials } from "@workspace/db";

export async function PATCH(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const access = await requireApiPermission("admin:access");
  if (access.response) return access.response;
  try {
    const updated = await updateOwnCredentials(
      await requestJson(request),
      actorFromSession(access.session),
      access.session.id,
    );
    return NextResponse.json({ ok: true, email: updated.email });
  } catch (error) {
    return apiError(error, "Account credentials could not be updated.");
  }
}
