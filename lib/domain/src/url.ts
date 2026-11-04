export class InvalidResourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResourceUrlError";
  }
}

/**
 * Produces a conservative canonical URL:
 * - accepts only absolute HTTP(S) URLs and rejects embedded credentials;
 * - relies on WHATWG URL parsing for host casing and default-port handling;
 * - removes fragments and trailing path slashes;
 * - retains the scheme, host (including www), path, and exact query string.
 *
 * Query parameter order and values are deliberately not rewritten because
 * they can distinguish resources on real services.
 */
export function normalizeResourceUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new InvalidResourceUrlError("A resource URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidResourceUrlError(
      "Use an absolute URL that includes http:// or https://.",
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidResourceUrlError("Only HTTP and HTTPS URLs are supported.");
  }
  if (!url.hostname) {
    throw new InvalidResourceUrlError("The URL must include a hostname.");
  }
  if (url.username || url.password) {
    throw new InvalidResourceUrlError(
      "URLs containing embedded credentials are not allowed.",
    );
  }

  // URL() lowercases hostnames and removes standard HTTP(S) ports.
  url.hash = "";
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${normalizedPath}${url.search}`;
}

export function isResourceUrl(input: string): boolean {
  try {
    normalizeResourceUrl(input);
    return true;
  } catch {
    return false;
  }
}
