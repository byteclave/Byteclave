import { NextRequest, NextResponse } from "next/server";
import { setManagedUserDisabled } from "@workspace/db";
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
    if (!body || typeof body !== "object" || typeof (body as { disabled?: unknown }).disabled !== "boolean") {
      return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
    }
    await setManagedUserDisabled(
      userId,
      (body as { disabled: boolean }).disabled,
      actorFromSession(access.session),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Account status could not be changed.");
  }
}
