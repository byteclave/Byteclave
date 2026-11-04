import { NextResponse } from "next/server";
import { listAdminAuditEvents } from "@workspace/db";
import { requireApiPermission } from "../../../../lib/admin-auth";

export async function GET() {
  const access = await requireApiPermission("audit:read");
  if (access.response) return access.response;
  return NextResponse.json(await listAdminAuditEvents());
}
