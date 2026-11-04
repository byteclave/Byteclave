import { NextRequest, NextResponse } from "next/server";
import { createAdminInvitation, listManagedUsers } from "@workspace/db";
import {
  actorFromSession,
  apiError,
  isSameOriginRequest,
  requestJson,
  requireApiPermission,
} from "../../../../lib/admin-auth";

export async function GET() {
  const access = await requireApiPermission("users:read");
  if (access.response) return access.response;
  const users = await listManagedUsers(access.session.roles);
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const access = await requireApiPermission("users:manage");
  if (access.response) return access.response;
  try {
    const invitation = await createAdminInvitation(
      await requestJson(request),
      actorFromSession(access.session),
    );
    const url = new URL("/admin/invitations/accept", request.url);
    url.searchParams.set("token", invitation.token);
    return NextResponse.json(
      {
        id: invitation.id,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        invitationUrl: url.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "Invitation could not be created.");
  }
}
