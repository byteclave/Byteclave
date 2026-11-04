import { NextRequest, NextResponse } from "next/server";
import { getSecuritySettings, updateSecuritySettings } from "@workspace/db";
import {
  actorFromSession,
  apiError,
  isSameOriginRequest,
  requestJson,
  requireApiPermission,
} from "../../../../../lib/admin-auth";

export async function GET() {
  const access = await requireApiPermission("security:manage");
  if (access.response) return access.response;
  return NextResponse.json(await getSecuritySettings());
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const access = await requireApiPermission("security:manage");
  if (access.response) return access.response;
  try {
    const settings = await updateSecuritySettings(
      await requestJson(request),
      actorFromSession(access.session),
    );
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    return apiError(error, "Security settings could not be updated.");
  }
}
