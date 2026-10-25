import { NextRequest, NextResponse } from "next/server";
import { issueManagedPasswordReset } from "@workspace/db";
import {
  actorFromSession,
  apiError,
  isSameOriginRequest,
  requestJson,
  requireApiPermission,
} from "../../../../../../lib/admin-auth";

export async function POST(
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
    if (!body || typeof body !== "object" || typeof (body as { currentPassword?: unknown }).currentPassword !== "string") {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    const result = await issueManagedPasswordReset(
      userId,
      (body as { currentPassword: string }).currentPassword,
      actorFromSession(access.session),
    );
    const url = new URL("/admin/reset-password", request.url);
    url.searchParams.set("token", result.token);
    return NextResponse.json({
      resetUrl: url.toString(),
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return apiError(error, "Password reset link could not be created.");
  }
}
