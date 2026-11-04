import { NextRequest, NextResponse } from "next/server";
import { completePasswordReset } from "@workspace/db";
import {
  apiError,
  isSameOriginRequest,
  requestJson,
} from "../../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  try {
    await completePasswordReset(await requestJson(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "Password reset could not be completed.");
  }
}
