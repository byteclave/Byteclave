"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminAppearanceQueryKey,
  getGetAdminCatalogQueryKey,
  getGetAdminPublishingQueueQueryKey,
  getListAdminContentVersionsQueryKey,
  useGetAdminAppearance,
  useGetAdminCatalog,
  useGetAdminPublishingQueue,
  useListAdminContentVersions,
  usePerformAdminPublishingAction,
  useRestoreAdminContentVersion,
  useUpdateAdminAppearance,
} from "@workspace/api-client-react";
import type {
  AppearanceSettings,
  ContentVersion,
  ListAdminContentVersionsParams,
  PublishingQueueHistoryItem,
  PublishingQueueItemsItem,
} from "@workspace/api-client-react";
import "./admin-workspaces.css";

type MediaAsset = {
  id: string;
  discoveryId: string | null;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  altText: string | null;
  createdAt: string;
  mediaUrl: string;
};

const mediaQueryKey = ["admin", "media"] as const;
const friendlyError = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed.";

async function mediaRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let result: (T & { error?: string }) | undefined;
  try {
    result = text ? (JSON.parse(text) as T & { error?: string }) : undefined;
  } catch {
    result = undefined;
  }
  if (!response.ok) {
    throw new Error(result?.error || text || "The request could not be completed.");
  }
  return result as T;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="admin-workspace admin-workspace-loading" role="status" aria-label={label}>
      <span className="admin-workspace-skeleton admin-workspace-skeleton-short" />
      <span className="admin-workspace-skeleton admin-workspace-skeleton-title" />
      <span className="admin-workspace-skeleton" />
      <span className="admin-workspace-skeleton" />
      <span className="admin-workspace-skeleton admin-workspace-skeleton-medium" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function WorkspaceFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="admin-panel admin-workspace-error" role="alert">
      <p className="admin-kicker">Request interrupted</p>
      <h2>Workspace data is unavailable</h2>
      <p className="admin-supporting">{message}</p>
      <button className="admin-secondary-button" type="button" onClick={retry}>Try again</button>
    </section>
  );
}

function Notice({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      {success && <p className="admin-form-success" role="status">{success}</p>}
    </>
  );
}

export function MediaAdminSection() {
  const queryClient = useQueryClient();
  const media = useQuery({
    queryKey: mediaQueryKey,
    queryFn: () => mediaRequest<MediaAsset[]>("/api/admin/media"),
    retry: false,
  });
  const catalog = useGetAdminCatalog({
    query: { enabled: true, queryKey: getGetAdminCatalogQueryKey() },
  });
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [altText, setAltText] = useState("");
  const [discoveryId, setDiscoveryId] = useState("");
  const [uploadAltText, setUploadAltText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const assets = media.data ?? [];
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const filteredAssets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) =>
      [asset.fileName, asset.contentType, asset.altText ?? ""].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [assets, search]);

  useEffect(() => {
    if (!selected) return;
    setAltText(selected.altText ?? "");
    setDiscoveryId(selected.discoveryId ?? "");
  }, [selected?.id]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const uploaded = await mediaRequest<MediaAsset>("/api/admin/media", {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-upload-filename": encodeURIComponent(file.name),
          "x-upload-content-type": file.type,
          "x-upload-alt-text": encodeURIComponent(uploadAltText),
        },
        body: file,
      });
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey });
      setSelectedId(uploaded.id);
      setUploadAltText("");
      if (fileInput.current) fileInput.current.value = "";
      setSuccess(`${uploaded.fileName} uploaded.`);
    } catch (uploadError) {
      setError(friendlyError(uploadError));
    } finally {
      setBusy(false);
    }
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const updated = await mediaRequest<MediaAsset>(`/api/admin/media/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          discoveryId: discoveryId || null,
          altText: altText.trim() || null,
        }),
      });
      queryClient.setQueryData<MediaAsset[]>(mediaQueryKey, (current) =>
        current?.map((asset) => asset.id === updated.id ? updated : asset),
      );
      setSuccess("Media details saved.");
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAsset(asset: MediaAsset) {
    if (!window.confirm(`Delete “${asset.fileName}”? This cannot be undone.`)) return;
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      await mediaRequest<void>(`/api/admin/media/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey });
      setSelectedId((current) => current === asset.id ? "" : current);
      setSuccess("Media asset deleted.");
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusy(false);
    }
  }

  async function copyMediaUrl() {
    if (!selected) return;
    setError("");
    setSuccess("");
    try {
      await navigator.clipboard.writeText(new URL(selected.mediaUrl, window.location.origin).toString());
      setSuccess("Media URL copied.");
    } catch {
      setError("The browser could not copy this URL. Open the media file to copy it manually.");
    }
  }

  if (media.isLoading) return <WorkspaceLoading label="Loading media library" />;
  if (media.isError || !media.data) {
    return <WorkspaceFailure message={friendlyError(media.error)} retry={() => void media.refetch()} />;
  }

  return (
    <div className="admin-stack admin-workspace">
      <section className="admin-panel" aria-labelledby="media-upload-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Library intake</p>
            <h2 id="media-upload-heading">Upload media</h2>
          </div>
          <span className="admin-panel-count">{assets.length} assets</span>
        </div>
        <form className="admin-form admin-workspace-upload" onSubmit={(event) => void upload(event)}>
          <label>
            Choose a file
            <input ref={fileInput} type="file" required aria-label="File to upload" />
          </label>
          <label>
            Alternative text
            <input
              value={uploadAltText}
              onChange={(event) => setUploadAltText(event.target.value)}
              maxLength={500}
              placeholder="Describe the image for visitors"
            />
          </label>
          <div className="admin-form-actions">
            <button className="admin-primary-button" type="submit" disabled={busy}>
              {busy ? "Uploading…" : "Upload file"}
            </button>
            <span className="admin-form-help">Upload size and type limits are enforced by the server.</span>
          </div>
          <Notice error={error} success={success} />
        </form>
      </section>

      <section className="admin-panel" aria-labelledby="media-library-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Stored assets</p>
            <h2 id="media-library-heading">Media library</h2>
          </div>
          <label className="admin-workspace-search">
            <span className="sr-only">Search media</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search files" />
          </label>
        </div>
        {!filteredAssets.length ? (
          <div className="admin-workspace-empty">
            <span className="admin-workspace-empty-index">01 / MEDIA</span>
            <p>{assets.length ? "No media matches that search." : "Nothing in the library yet. Upload a file to begin."}</p>
          </div>
        ) : (
          <div className="admin-media-layout">
            <div className="admin-media-grid" aria-label="Media assets">
              {filteredAssets.map((asset) => (
                <article key={asset.id} className={`admin-media-card${asset.id === selectedId ? " is-selected" : ""}`}>
                  <button
                    type="button"
                    className="admin-media-select"
                    aria-pressed={asset.id === selectedId}
                    aria-label={`Select ${asset.fileName}`}
                    onClick={() => { setSelectedId(asset.id); setError(""); setSuccess(""); }}
                  >
                    <span className="admin-media-thumb">
                      {asset.contentType.startsWith("image/") ? (
                        <img src={asset.mediaUrl} alt={asset.altText || ""} loading="lazy" />
                      ) : (
                        <span className="admin-media-filetype">{asset.contentType.split("/").pop() || "FILE"}</span>
                      )}
                    </span>
                    <span className="admin-media-name">{asset.fileName}</span>
                    <span className="admin-table-secondary">{bytesLabel(asset.sizeBytes)} · {asset.contentType}</span>
                  </button>
                  <button
                    type="button"
                    className="admin-table-action danger-action admin-media-delete"
                    disabled={busy}
                    onClick={() => void deleteAsset(asset)}
                    aria-label={`Delete ${asset.fileName}`}
                  >
                    Delete
                  </button>
                </article>
              ))}
            </div>
            {selected && (
              <aside className="admin-media-inspector" aria-labelledby="media-inspector-heading">
                <div className="admin-media-inspector-heading">
                  <p className="admin-kicker">Selected asset</p>
                  <h3 id="media-inspector-heading">{selected.fileName}</h3>
                  <span className="admin-table-secondary">Added {dateLabel(selected.createdAt)}</span>
                </div>
                {selected.contentType.startsWith("image/") && (
                  <div className="admin-media-large-preview">
                    <img src={selected.mediaUrl} alt={selected.altText || ""} />
                  </div>
                )}
                <form className="admin-form" onSubmit={(event) => void saveAsset(event)}>
                  <label>
                    Alternative text
                    <input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={500} />
                  </label>
                  <label>
                    Linked discovery
                    <select
                      value={discoveryId}
                      onChange={(event) => setDiscoveryId(event.target.value)}
                      disabled={catalog.isLoading || catalog.isError || !catalog.data}
                    >
                      <option value="">Not linked</option>
                      {catalog.data?.discoveries.map((discovery) => (
                        <option key={discovery.id} value={discovery.id}>{discovery.title}</option>
                      ))}
                    </select>
                  </label>
                  {catalog.isError && <p className="admin-form-help" role="status">Discovery linking is unavailable until the catalog loads.</p>}
                  <div className="admin-form-actions">
                    <button className="admin-primary-button" type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save details"}
                    </button>
                    <button className="admin-secondary-button" type="button" onClick={() => void copyMediaUrl()}>
                      Copy URL
                    </button>
                  </div>
                </form>
                <a className="admin-media-open-link" href={selected.mediaUrl} target="_blank" rel="noreferrer">
                  Open original file
                </a>
              </aside>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const statusActionLabels = {
  submit_for_review: "Submit for review",
  approve: "Approve and publish",
  reject: "Return to draft",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore to draft",
} as const;

function actionsForStatus(status: PublishingQueueItemsItem["status"]) {
  if (status === "draft") return ["submit_for_review"] as const;
  if (status === "review") return ["approve", "reject"] as const;
  if (status === "published") return ["unpublish", "archive"] as const;
  return ["restore"] as const;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-${status}`}>{status}</span>;
}

export function PublishingAdminSection() {
  const queryClient = useQueryClient();
  const queue = useGetAdminPublishingQueue({
    query: { enabled: true, queryKey: getGetAdminPublishingQueueQueryKey() },
  });
  const action = usePerformAdminPublishingAction();
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("review");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const items = useMemo(() => queue.data?.items ?? [], [queue.data?.items]);
  const visibleItems = useMemo(
    () => filter === "all" ? items : items.filter((item) => item.status === filter),
    [filter, items],
  );
  const selected = items.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (items.length && !items.some((item) => item.id === selectedId)) {
      setSelectedId((items.find((item) => item.status === "review") ?? items[0]).id);
    }
  }, [items, selectedId]);

  function performAction(item: PublishingQueueItemsItem, nextAction: ReturnType<typeof actionsForStatus>[number]) {
    setError("");
    setSuccess("");
    action.mutate(
      { id: item.id, data: { action: nextAction, ...(note.trim() ? { note: note.trim() } : {}) } },
      {
        onSuccess: () => {
          setSuccess(`${item.title} is now ${nextAction === "approve" ? "published" : nextAction === "reject" || nextAction === "unpublish" || nextAction === "restore" ? "a draft" : nextAction === "submit_for_review" ? "in review" : "archived"}.`);
          setNote("");
          void queryClient.invalidateQueries({ queryKey: getGetAdminPublishingQueueQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() });
        },
        onError: (actionError) => setError(friendlyError(actionError)),
      },
    );
  }

  if (queue.isLoading) return <WorkspaceLoading label="Loading publishing queue" />;
  if (queue.isError || !queue.data) {
    return <WorkspaceFailure message={friendlyError(queue.error)} retry={() => void queue.refetch()} />;
  }

  const history = [...queue.data.history].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="admin-stack admin-workspace">
      <section className="admin-panel" aria-labelledby="publishing-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Editorial control</p>
            <h2 id="publishing-heading">Publishing queue</h2>
          </div>
          <span className="admin-panel-count">{items.filter((item) => item.status === "review").length} awaiting review</span>
        </div>
        <div className="admin-workspace-filter-row">
          <label>
            <span>Show records</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="review">Review queue</option>
              <option value="all">All states</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <span className="admin-form-help">{visibleItems.length} {visibleItems.length === 1 ? "record" : "records"}</span>
        </div>
        <Notice error={error} success={success} />
        {visibleItems.length ? (
          <div className="admin-publishing-layout">
            <div className="admin-publishing-list" aria-label="Publishing records">
              {visibleItems.map((item, index) => (
                <button
                  className={`admin-publishing-item${selected?.id === item.id ? " is-selected" : ""}`}
                  type="button"
                  key={item.id}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => { setSelectedId(item.id); setError(""); setSuccess(""); }}
                >
                  <span className="admin-publishing-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="admin-publishing-item-copy">
                    <strong>{item.title}</strong>
                    <span>{item.slug} · updated {dateLabel(item.updatedAt)}</span>
                  </span>
                  <StatusPill status={item.status} />
                </button>
              ))}
            </div>
            {selected && (
              <article className="admin-publishing-preview" aria-labelledby="publishing-preview-heading">
                <div className="admin-panel-heading">
                  <div>
                    <p className="admin-kicker">Content preview</p>
                    <h3 id="publishing-preview-heading">{selected.title}</h3>
                  </div>
                  <StatusPill status={selected.status} />
                </div>
                <a href={selected.url} target="_blank" rel="noreferrer" className="admin-publishing-url">{selected.url}</a>
                <p className="admin-publishing-summary">{selected.summary || "No summary has been added."}</p>
                <div className="admin-publishing-description">
                  <span className="admin-workspace-label">Description</span>
                  <p>{selected.description || "No long description has been added."}</p>
                </div>
                <form className="admin-form admin-publishing-actions" onSubmit={(event) => event.preventDefault()}>
                  <label>
                    Editorial note <span className="admin-form-help">Optional · up to 1,000 characters</span>
                    <textarea value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} />
                  </label>
                  <div className="admin-form-actions">
                    {actionsForStatus(selected.status).map((nextAction) => (
                      <button
                        type="button"
                        key={nextAction}
                        className={nextAction === "reject" || nextAction === "archive" ? "admin-secondary-button danger-action" : "admin-primary-button"}
                        disabled={action.isPending}
                        onClick={() => performAction(selected, nextAction)}
                      >
                        {action.isPending ? "Updating…" : statusActionLabels[nextAction]}
                      </button>
                    ))}
                  </div>
                </form>
              </article>
            )}
          </div>
        ) : (
          <div className="admin-workspace-empty">
            <span className="admin-workspace-empty-index">02 / QUEUE</span>
            <p>{filter === "review" ? "The review queue is clear." : "No records match this state."}</p>
          </div>
        )}
      </section>

      <section className="admin-panel" aria-labelledby="publishing-history-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Recorded transitions</p>
            <h2 id="publishing-history-heading">Publication history</h2>
          </div>
          <span className="admin-panel-count">{history.length} events</span>
        </div>
        {!history.length ? (
          <p className="admin-empty">Publication changes will appear here as editors act on records.</p>
        ) : (
          <ol className="admin-publishing-history">
            {history.map((entry: PublishingQueueHistoryItem) => {
              const item = items.find((candidate) => candidate.id === entry.discoveryId);
              return (
                <li key={entry.id}>
                  <span className="admin-history-mark" aria-hidden="true" />
                  <div className="admin-history-main">
                    <strong>{item?.title || `Discovery ${entry.discoveryId.slice(0, 8)}`}</strong>
                    <span className="admin-table-secondary">
                      <StatusPill status={entry.fromStatus} /> <span className="admin-history-arrow">→</span> <StatusPill status={entry.toStatus} />
                    </span>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                  <div className="admin-history-meta">
                    <span>{entry.actorEmail || "System"}</span>
                    <time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

const entityTypes = ["discovery", "category", "subcategory", "tag", "collection"] as const;

function snapshotSummary(version: ContentVersion) {
  const snapshot = version.snapshot;
  const label = typeof snapshot.title === "string"
    ? snapshot.title
    : typeof snapshot.name === "string"
      ? snapshot.name
      : typeof snapshot.slug === "string"
        ? `/${snapshot.slug}`
        : version.entityId.slice(0, 12);
  return label;
}

export function VersionsAdminSection() {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const params = useMemo<ListAdminContentVersionsParams>(() => ({
    ...(entityType ? { entityType: entityType as NonNullable<ListAdminContentVersionsParams["entityType"]> } : {}),
    ...(entityId.trim() ? { entityId: entityId.trim() } : {}),
    limit: 100,
  }), [entityId, entityType]);
  const versions = useListAdminContentVersions(params, {
    query: { enabled: true, queryKey: getListAdminContentVersionsQueryKey(params) },
  });
  const restore = useRestoreAdminContentVersion();
  const entries = versions.data ?? [];
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  function restoreSnapshot(version: ContentVersion) {
    if (!window.confirm(`Restore this ${version.entityType} snapshot? The current record will be preserved in history as a new change.`)) return;
    setError("");
    setSuccess("");
    restore.mutate(
      { versionId: version.id },
      {
        onSuccess: (result) => {
          setSuccess(`Snapshot restored for ${result.entityType} ${result.entityId.slice(0, 8)}. A new history entry was recorded.`);
          void queryClient.invalidateQueries({ queryKey: getListAdminContentVersionsQueryKey(params) });
          void queryClient.invalidateQueries({ queryKey: getGetAdminCatalogQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminPublishingQueueQueryKey() });
        },
        onError: (restoreError) => setError(friendlyError(restoreError)),
      },
    );
  }

  if (versions.isLoading) return <WorkspaceLoading label="Loading content snapshots" />;
  if (versions.isError || !versions.data) {
    return <WorkspaceFailure message={friendlyError(versions.error)} retry={() => void versions.refetch()} />;
  }

  return (
    <div className="admin-stack admin-workspace">
      <section className="admin-panel" aria-labelledby="versions-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Auditable snapshots</p>
            <h2 id="versions-heading">Version history</h2>
          </div>
          <span className="admin-panel-count">Latest 100</span>
        </div>
        <div className="admin-version-filters">
          <label>
            Content type
            <select value={entityType} onChange={(event) => { setEntityType(event.target.value); setSelectedId(""); }}>
              <option value="">All content types</option>
              {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Entity ID
            <input value={entityId} onChange={(event) => { setEntityId(event.target.value); setSelectedId(""); }} placeholder="Filter by exact ID" />
          </label>
        </div>
        <Notice error={error} success={success} />
        {!entries.length ? (
          <div className="admin-workspace-empty">
            <span className="admin-workspace-empty-index">03 / HISTORY</span>
            <p>No snapshots match these filters.</p>
          </div>
        ) : (
          <div className="admin-version-layout">
            <div className="admin-version-list" aria-label="Content snapshots">
              {entries.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`admin-version-item${selected?.id === entry.id ? " is-selected" : ""}`}
                  aria-pressed={selected?.id === entry.id}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <span className="admin-version-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="admin-version-copy">
                    <strong>{snapshotSummary(entry)}</strong>
                    <span>{entry.entityType} · {entry.action} · {dateLabel(entry.createdAt)}</span>
                    <span className="admin-version-actor">{entry.actorEmail || "System"} · {entry.entityId.slice(0, 12)}</span>
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <article className="admin-version-detail" aria-labelledby="snapshot-heading">
                <div className="admin-panel-heading">
                  <div>
                    <p className="admin-kicker">Snapshot record</p>
                    <h3 id="snapshot-heading">{snapshotSummary(selected)}</h3>
                  </div>
                  <span className="admin-panel-count">{selected.entityType} · {selected.action}</span>
                </div>
                <dl className="admin-version-metadata">
                  <div><dt>Recorded</dt><dd>{dateLabel(selected.createdAt)}</dd></div>
                  <div><dt>Entity ID</dt><dd><code>{selected.entityId}</code></dd></div>
                  <div><dt>Editor</dt><dd>{selected.actorEmail || "System"}</dd></div>
                  {selected.sourceVersionId && <div><dt>Source version</dt><dd><code>{selected.sourceVersionId}</code></dd></div>}
                </dl>
                <details className="admin-snapshot-json">
                  <summary>Inspect snapshot data</summary>
                  <pre>{JSON.stringify(selected.snapshot, null, 2)}</pre>
                </details>
                <div className="admin-form-actions admin-version-actions">
                  <button className="admin-primary-button" type="button" onClick={() => restoreSnapshot(selected)} disabled={restore.isPending}>
                    {restore.isPending ? "Restoring…" : "Restore this version"}
                  </button>
                  <p className="admin-form-help">Restore creates a new change; it does not erase later history.</p>
                </div>
              </article>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const emptyAppearance: AppearanceSettings = {
  homepageEyebrow: "",
  homepageHeadline: "",
  homepageDescription: "",
  footerText: "",
};

export function AppearanceAdminSection() {
  const queryClient = useQueryClient();
  const settings = useGetAdminAppearance({
    query: { enabled: true, queryKey: getGetAdminAppearanceQueryKey() },
  });
  const update = useUpdateAdminAppearance();
  const [form, setForm] = useState<AppearanceSettings>(emptyAppearance);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      setForm(settings.data);
    }
  }, [settings.data]);

  const dirty = Boolean(settings.data) && (
    form.homepageEyebrow !== settings.data?.homepageEyebrow ||
    form.homepageHeadline !== settings.data?.homepageHeadline ||
    form.homepageDescription !== settings.data?.homepageDescription ||
    form.footerText !== settings.data?.footerText
  );

  function change(field: keyof AppearanceSettings, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    update.mutate(
      { data: form },
      {
        onSuccess: (saved) => {
          setForm(saved);
          queryClient.setQueryData(getGetAdminAppearanceQueryKey(), saved);
          setSuccess("Homepage copy and footer text saved.");
        },
        onError: (saveError) => setError(friendlyError(saveError)),
      },
    );
  }

  if (settings.isLoading) return <WorkspaceLoading label="Loading appearance settings" />;
  if (settings.isError || !settings.data) {
    return <WorkspaceFailure message={friendlyError(settings.error)} retry={() => void settings.refetch()} />;
  }

  return (
    <div className="admin-stack admin-workspace">
      <section className="admin-panel" aria-labelledby="appearance-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">Public-facing copy</p>
            <h2 id="appearance-heading">Homepage and footer</h2>
          </div>
          <span className="admin-panel-count">Supported fields only</span>
        </div>
        <p className="admin-supporting">Edit the words visitors see. The canonical ByteClave palette and logo remain fixed.</p>
        <form className="admin-form admin-appearance-form" onSubmit={(event) => void save(event)}>
          <label>
            Homepage eyebrow
            <input
              value={form.homepageEyebrow}
              onChange={(event) => change("homepageEyebrow", event.target.value)}
              maxLength={120}
            />
            <span className="admin-form-help">Short label above the homepage headline.</span>
          </label>
          <label>
            Homepage headline
            <input
              value={form.homepageHeadline}
              onChange={(event) => change("homepageHeadline", event.target.value)}
              maxLength={180}
              required
            />
            <span className="admin-form-help">The main heading in the public home page.</span>
          </label>
          <label>
            Homepage description
            <textarea
              value={form.homepageDescription}
              onChange={(event) => change("homepageDescription", event.target.value)}
              maxLength={1000}
              rows={4}
            />
          </label>
          <label>
            Footer text
            <input
              value={form.footerText}
              onChange={(event) => change("footerText", event.target.value)}
              maxLength={180}
            />
          </label>
          <Notice error={error} success={success} />
          <div className="admin-form-actions">
            <button className="admin-primary-button" type="submit" disabled={!dirty || update.isPending}>
              {update.isPending ? "Saving…" : dirty ? "Save copy" : "All changes saved"}
            </button>
            <button
              className="admin-secondary-button"
              type="button"
              disabled={!dirty || update.isPending}
              onClick={() => { setForm(settings.data!); setError(""); setSuccess(""); }}
            >
              Discard changes
            </button>
          </div>
        </form>
      </section>

      <section className="admin-panel admin-appearance-preview" aria-labelledby="appearance-preview-heading">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-kicker">At a glance</p>
            <h2 id="appearance-preview-heading">Copy preview</h2>
          </div>
          <span className="admin-panel-count">Preview only</span>
        </div>
        <div className="admin-copy-preview">
          <span className="admin-kicker">{form.homepageEyebrow || "Homepage eyebrow"}</span>
          <strong>{form.homepageHeadline || "Your homepage headline"}</strong>
          <p>{form.homepageDescription || "Your homepage description will appear here."}</p>
        </div>
        <div className="admin-footer-preview">
          <span className="admin-workspace-label">Footer</span>
          <p>{form.footerText || "Footer text appears here."}</p>
        </div>
      </section>
    </div>
  );
}
