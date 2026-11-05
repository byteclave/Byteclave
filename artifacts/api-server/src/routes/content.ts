import { Router, type RequestHandler } from "express";
import {
  CreateCategoryBody,
  CreateCollectionBody,
  CreateDiscoveryBody,
  CreateSubcategoryBody,
  CreateTagBody,
  DeleteSubcategoryBody,
  GetAdminCatalogResponse,
  GetAdminOverviewResponse,
  GetAdminSessionResponse,
  GetExploreCatalogResponse,
  GetPublicCategoryResponse,
  GetPublicCollectionResponse,
  GetPublicDiscoveryResponse,
  GetPublicSubcategoryResponse,
  LoginAdminBody,
  LoginAdminResponse,
  LogoutAdminResponse,
  SearchPublishedCatalogQueryParams,
  SearchPublishedCatalogResponse,
  UpdateCategoryBody,
  UpdateCollectionBody,
  UpdateDiscoveryBody,
  UpdateSubcategoryBody,
  UpdateTagBody,
} from "@workspace/api-zod";
import {
  acceptAdminInvitation,
  authenticatePassword,
  changeManagedUserRole,
  completePasswordReset,
  createAdminSession,
  createAdminInvitation,
  createCategory,
  createCollection,
  createDiscovery,
  createSubcategory,
  createTag,
  deleteCategory,
  deleteCollection,
  deleteDiscovery,
  deleteSubcategory,
  deleteTag,
  getAdminCatalog,
  getAdminOverviewMetrics,
  getAdminSession,
  getSecuritySettings,
  issueManagedPasswordReset,
  listAdminAuditEvents,
  listManagedUsers,
  getCategoryPageData,
  getCollectionPageData,
  getDiscoveryPageData,
  getExploreCatalog,
  getSubcategoryPageData,
  InvalidCredentialsError,
  LoginRateLimitError,
  revokeAdminSession,
  setManagedUserDisabled,
  searchPublishedDiscoveries,
  updateCategory,
  updateCollection,
  updateDiscovery,
  updateOwnCredentials,
  updateSecuritySettings,
  updateSubcategory,
  updateTag,
} from "@workspace/db";
import { hasPermission } from "@workspace/domain";
import type { AdminSession } from "@workspace/db/services";
import type { NextFunction, Request, Response } from "express";

type ValidationFailure = { issues: Array<{ message: string }> };

const publicRouter = Router();
const authRouter = Router();
const contentRouter = Router();
const isProduction = process.env.NODE_ENV === "production";
const cookieName = isProduction
  ? "__Host-byteclave_admin_session"
  : "byteclave_admin_session";

type AuthenticatedRequest = Request & { adminSession?: AdminSession };

function sessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() !== cookieName) continue;
    try {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const asyncRoute =
  (handler: RequestHandler): RequestHandler =>
  (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };

const sameOriginForWrites: RequestHandler = (request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }

  const origin = request.get("origin");
  const fetchSite = request.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    response.status(403).json({ error: "Cross-site requests are not allowed." });
    return;
  }
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== request.get("host")) {
        response.status(403).json({ error: "Requests must come from this site." });
        return;
      }
    } catch {
      response.status(403).json({ error: "The request origin is invalid." });
      return;
    }
  }
  next();
};

function requirePermission(permission: string): RequestHandler {
  return asyncRoute(async (request, response, next) => {
    const session = await getAdminSession(sessionToken(request));
    if (!session) {
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!hasPermission(session.permissions, permission)) {
      response.status(403).json({ error: "You do not have permission to do that." });
      return;
    }
    (request as AuthenticatedRequest).adminSession = session;
    next();
  });
}

function actor(request: Request): AdminSession {
  const session = (request as AuthenticatedRequest).adminSession;
  if (!session) throw new Error("The request has no authenticated administrator.");
  return session;
}

function rejectInvalidBody(
  error: ValidationFailure,
  response: Response,
): void {
  response.status(400).json({
    error: error.issues.map((issue) => issue.message).join(" "),
  });
}

function checkBody<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: ValidationFailure };
  },
  body: unknown,
  response: Response,
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    rejectInvalidBody(result.error, response);
    return null;
  }
  return result.data;
}

function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function mayChangeToStatus(
  request: Request,
  response: Response,
  status: string,
): boolean {
  const permission = status === "published" ? "publishing:publish" : "publishing:review";
  if (!hasPermission(actor(request).permissions, permission)) {
    response.status(403).json({ error: `The ${permission} permission is required.` });
    return false;
  }
  return true;
}

publicRouter.get(
  "/catalog/explore",
  asyncRoute(async (_request, response) => {
    response.json(GetExploreCatalogResponse.parse(await getExploreCatalog()));
  }),
);

publicRouter.get(
  "/catalog/search",
  asyncRoute(async (request, response) => {
    const params = checkBody(
      SearchPublishedCatalogQueryParams,
      request.query,
      response,
    );
    if (!params) return;
    response.json(
      SearchPublishedCatalogResponse.parse(
        await searchPublishedDiscoveries(params.q),
      ),
    );
  }),
);

publicRouter.get(
  "/catalog/categories/:slug",
  asyncRoute(async (request, response) => {
    const result = await getCategoryPageData(routeParam(request, "slug"));
    if (!result) {
      response.status(404).json({ error: "Category not found." });
      return;
    }
    response.json(
      GetPublicCategoryResponse.parse({
        category: { ...result.category, subcategories: result.subcategories },
        subcategories: result.subcategories,
        discoveries: result.discoveries,
      }),
    );
  }),
);

publicRouter.get(
  "/catalog/categories/:categorySlug/:subcategorySlug",
  asyncRoute(async (request, response) => {
    const result = await getSubcategoryPageData(
      routeParam(request, "categorySlug"),
      routeParam(request, "subcategorySlug"),
    );
    if (!result) {
      response.status(404).json({ error: "Subcategory not found." });
      return;
    }
    response.json(GetPublicSubcategoryResponse.parse(result));
  }),
);

publicRouter.get(
  "/catalog/collections/:slug",
  asyncRoute(async (request, response) => {
    const result = await getCollectionPageData(routeParam(request, "slug"));
    if (!result) {
      response.status(404).json({ error: "Collection not found." });
      return;
    }
    response.json(
      GetPublicCollectionResponse.parse({
        collection: {
          slug: result.collection.slug,
          name: result.collection.name,
          description: result.collection.description,
          publishedDiscoveryCount: result.discoveries.length,
        },
        discoveries: result.discoveries,
      }),
    );
  }),
);

publicRouter.get(
  "/catalog/discoveries/:slug",
  asyncRoute(async (request, response) => {
    const result = await getDiscoveryPageData(routeParam(request, "slug"));
    if (!result) {
      response.status(404).json({ error: "Discovery not found." });
      return;
    }
    response.json(GetPublicDiscoveryResponse.parse(result));
  }),
);

authRouter.use(sameOriginForWrites);
authRouter.get(
  "/admin/session",
  asyncRoute(async (request, response) => {
    const session = await getAdminSession(sessionToken(request));
    if (!session) {
      response.status(401).json({ error: "Sign in to continue." });
      return;
    }
    response.json(
      GetAdminSessionResponse.parse({
        id: session.id,
        userId: session.userId,
        email: session.email,
        displayName: session.displayName,
        roles: session.roles,
        permissions: session.permissions,
      }),
    );
  }),
);

authRouter.post(
  "/admin/auth/login",
  asyncRoute(async (request, response) => {
    const body = checkBody(LoginAdminBody, request.body, response);
    if (!body) return;
    const user = await authenticatePassword(body, request.ip || "unknown");
    const session = await createAdminSession(user.userId);
    response.cookie(cookieName, session.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
    });
    response.json(LoginAdminResponse.parse({ ok: true }));
  }),
);

authRouter.post(
  "/admin/auth/logout",
  asyncRoute(async (request, response) => {
    const token = sessionToken(request);
    const session = token ? await getAdminSession(token) : null;
    if (token && session) await revokeAdminSession(token, session.userId);
    response.clearCookie(cookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
    });
    response.json(LogoutAdminResponse.parse({ ok: true }));
  }),
);

authRouter.post(
  "/admin/auth/accept-invitation",
  asyncRoute(async (request, response) => {
    const account = await acceptAdminInvitation(request.body);
    const session = await createAdminSession(account.userId);
    response.cookie(cookieName, session.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
    });
    response.status(201).json({ ok: true });
  }),
);

authRouter.post(
  "/admin/auth/reset-password",
  asyncRoute(async (request, response) => {
    await completePasswordReset(request.body);
    response.json({ ok: true });
  }),
);

contentRouter.use(sameOriginForWrites);
contentRouter.get(
  "/admin/overview",
  requirePermission("catalog:read"),
  asyncRoute(async (_request, response) => {
    response.json(
      GetAdminOverviewResponse.parse(await getAdminOverviewMetrics()),
    );
  }),
);
contentRouter.get(
  "/admin/catalog",
  requirePermission("catalog:read"),
  asyncRoute(async (_request, response) => {
    response.json(GetAdminCatalogResponse.parse(await getAdminCatalog()));
  }),
);

contentRouter.get(
  "/admin/users",
  requirePermission("users:read"),
  asyncRoute(async (request, response) => {
    response.json(await listManagedUsers(actor(request).roles));
  }),
);
contentRouter.post(
  "/admin/users",
  requirePermission("users:manage"),
  asyncRoute(async (request, response) => {
    const invitation = await createAdminInvitation(request.body, actor(request));
    const origin =
      request.get("origin") ?? `${request.protocol}://${request.get("host")}`;
    const refererPath = request.get("referer")
      ? new URL(request.get("referer")!).pathname
      : "/";
    const adminPath = refererPath.indexOf("/admin");
    const applicationBase =
      adminPath >= 0 ? refererPath.slice(0, adminPath + 1) : "/";
    const invitationUrl = new URL(
      `${applicationBase}admin/invitations/accept`,
      origin,
    );
    invitationUrl.searchParams.set("token", invitation.token);
    response.status(201).json({
      id: invitation.id,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      invitationUrl: invitationUrl.toString(),
    });
  }),
);
contentRouter.patch(
  "/admin/users/:userId/role",
  requirePermission("users:manage"),
  asyncRoute(async (request, response) => {
    const body = request.body as { role?: unknown } | undefined;
    if (!body || typeof body.role !== "string") {
      response.status(400).json({ error: "A user role is required." });
      return;
    }
    const role = await changeManagedUserRole(
      { userId: routeParam(request, "userId"), role: body.role },
      actor(request),
    );
    response.json({ ok: true, role });
  }),
);
contentRouter.patch(
  "/admin/users/:userId/status",
  requirePermission("users:manage"),
  asyncRoute(async (request, response) => {
    const body = request.body as { disabled?: unknown } | undefined;
    if (!body || typeof body.disabled !== "boolean") {
      response.status(400).json({ error: "Choose whether the account is disabled." });
      return;
    }
    await setManagedUserDisabled(
      routeParam(request, "userId"),
      body.disabled,
      actor(request),
    );
    response.json({ ok: true });
  }),
);
contentRouter.post(
  "/admin/users/:userId/password-reset",
  requirePermission("users:manage"),
  asyncRoute(async (request, response) => {
    const body = request.body as { currentPassword?: unknown } | undefined;
    if (!body || typeof body.currentPassword !== "string") {
      response.status(400).json({ error: "Current password is required." });
      return;
    }
    const reset = await issueManagedPasswordReset(
      routeParam(request, "userId"),
      body.currentPassword,
      actor(request),
    );
    const origin =
      request.get("origin") ?? `${request.protocol}://${request.get("host")}`;
    const refererPath = request.get("referer")
      ? new URL(request.get("referer")!).pathname
      : "/";
    const adminPath = refererPath.indexOf("/admin");
    const applicationBase =
      adminPath >= 0 ? refererPath.slice(0, adminPath + 1) : "/";
    const resetUrl = new URL(`${applicationBase}admin/reset-password`, origin);
    resetUrl.searchParams.set("token", reset.token);
    response.json({ resetUrl: resetUrl.toString(), expiresAt: reset.expiresAt });
  }),
);
contentRouter.get(
  "/admin/audit",
  requirePermission("audit:read"),
  asyncRoute(async (_request, response) => {
    response.json(await listAdminAuditEvents());
  }),
);
contentRouter.patch(
  "/admin/account",
  requirePermission("admin:access"),
  asyncRoute(async (request, response) => {
    const current = actor(request);
    const updated = await updateOwnCredentials(
      request.body,
      current,
      current.id,
    );
    response.json({ ok: true, email: updated.email });
  }),
);
contentRouter.get(
  "/admin/settings/security",
  requirePermission("security:manage"),
  asyncRoute(async (_request, response) => {
    response.json(await getSecuritySettings());
  }),
);
contentRouter.put(
  "/admin/settings/security",
  requirePermission("security:manage"),
  asyncRoute(async (request, response) => {
    const session = actor(request);
    const settings = await updateSecuritySettings(request.body, {
      userId: session.userId,
      roles: session.roles,
      permissions: session.permissions,
    });
    response.json({ ok: true, settings });
  }),
);

contentRouter.post(
  "/admin/discoveries",
  requirePermission("discoveries:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(CreateDiscoveryBody, request.body, response);
    if (!body) return;
    if (body.status !== "draft" && !mayChangeToStatus(request, response, body.status)) return;
    const result = await createDiscovery(body, actor(request).userId);
    response.status(result.duplicate ? 200 : 201).json(result);
  }),
);

contentRouter.patch(
  "/admin/discoveries/:id",
  requirePermission("discoveries:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(UpdateDiscoveryBody, request.body, response);
    if (!body) return;
    const catalog = await getAdminCatalog();
    const id = routeParam(request, "id");
    const current = catalog.discoveries.find((item) => item.id === id);
    if (!current) {
      response.status(404).json({ error: "Discovery not found." });
      return;
    }
    if (body.status !== current.status && !mayChangeToStatus(request, response, body.status)) return;
    response.json(
      await updateDiscovery(id, body, actor(request).userId),
    );
  }),
);

contentRouter.delete(
  "/admin/discoveries/:id",
  requirePermission("discoveries:manage"),
  asyncRoute(async (request, response) => {
    await deleteDiscovery(routeParam(request, "id"), actor(request).userId);
    response.status(204).end();
  }),
);

contentRouter.post(
  "/admin/categories",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(CreateCategoryBody, request.body, response);
    if (!body) return;
    response.status(201).json(await createCategory(body, actor(request).userId));
  }),
);
contentRouter.patch(
  "/admin/categories/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(UpdateCategoryBody, request.body, response);
    if (!body) return;
    response.json(await updateCategory(routeParam(request, "id"), body, actor(request).userId));
  }),
);
contentRouter.delete(
  "/admin/categories/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    await deleteCategory(routeParam(request, "id"), actor(request).userId);
    response.status(204).end();
  }),
);

contentRouter.post(
  "/admin/categories/:categoryId/subcategories",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(CreateSubcategoryBody, request.body, response);
    if (!body) return;
    if (body.categoryId !== routeParam(request, "categoryId")) {
      response.status(400).json({ error: "The subcategory category does not match the route." });
      return;
    }
    response.status(201).json(await createSubcategory(body, actor(request).userId));
  }),
);
contentRouter.patch(
  "/admin/subcategories/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(UpdateSubcategoryBody, request.body, response);
    if (!body) return;
    response.json(await updateSubcategory(routeParam(request, "id"), body, actor(request).userId));
  }),
);
contentRouter.delete(
  "/admin/subcategories/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(DeleteSubcategoryBody, request.body, response);
    if (!body) return;
    await deleteSubcategory(
      routeParam(request, "id"),
      body.moveDiscoveriesToCategoryRoot,
      actor(request).userId,
    );
    response.status(204).end();
  }),
);

contentRouter.post(
  "/admin/tags",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(CreateTagBody, request.body, response);
    if (!body) return;
    response.status(201).json(await createTag(body.name, actor(request).userId));
  }),
);
contentRouter.patch(
  "/admin/tags/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(UpdateTagBody, request.body, response);
    if (!body) return;
    response.json(await updateTag(routeParam(request, "id"), body.name, actor(request).userId));
  }),
);
contentRouter.delete(
  "/admin/tags/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    await deleteTag(routeParam(request, "id"), actor(request).userId);
    response.status(204).end();
  }),
);

contentRouter.post(
  "/admin/collections",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(CreateCollectionBody, request.body, response);
    if (!body) return;
    response.status(201).json(await createCollection(body, actor(request).userId));
  }),
);
contentRouter.patch(
  "/admin/collections/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    const body = checkBody(UpdateCollectionBody, request.body, response);
    if (!body) return;
    response.json(await updateCollection(routeParam(request, "id"), body, actor(request).userId));
  }),
);
contentRouter.delete(
  "/admin/collections/:id",
  requirePermission("categories:manage"),
  asyncRoute(async (request, response) => {
    await deleteCollection(routeParam(request, "id"), actor(request).userId);
    response.status(204).end();
  }),
);

export default [publicRouter, authRouter, contentRouter];

export function contentErrorHandler(
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    const validation = error as ValidationFailure;
    response.status(400).json({
      error: validation.issues.map((issue) => issue.message).join(" "),
    });
    return;
  }
  if (error instanceof LoginRateLimitError) {
    response.status(429).json({ error: error.message });
    return;
  }
  if (error instanceof InvalidCredentialsError) {
    response.status(401).json({ error: error.message });
    return;
  }
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "Request failed.";
  if (name === "PermissionDeniedError") {
    response.status(403).json({ error: message });
    return;
  }
  if (name === "ContentConflictError" || name === "InvalidPublishingTransitionError") {
    response.status(409).json({ error: message });
    return;
  }
  if (name === "InvalidContentError") {
    response.status(400).json({ error: message });
    return;
  }
  if (name === "ContentNotFoundError" || name === "DiscoveryNotFoundError") {
    response.status(404).json({ error: message });
    return;
  }
  if (name === "Error" && /already exists|already in use|duplicate/i.test(message)) {
    response.status(409).json({ error: message });
    return;
  }
  if (name === "Error" && /does not exist|not found/i.test(message)) {
    response.status(404).json({ error: message });
    return;
  }
  if (name === "Error" && /invalid|expired|too large|valid JSON/i.test(message)) {
    response.status(400).json({ error: message });
    return;
  }
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError.code === "23505") {
    response.status(409).json({ error: "A record with those values already exists." });
    return;
  }
  if (databaseError.code === "23503") {
    response.status(409).json({ error: "The requested change conflicts with related content." });
    return;
  }
  request.log?.error({ err: error }, "API request failed");
  response.status(500).json({ error: "The request could not be completed." });
}
