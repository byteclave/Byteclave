import { describe, expect, it } from "vitest";
import {
  InvalidResourceUrlError,
  isResourceUrl,
  normalizeResourceUrl,
} from "./url";

describe("normalizeResourceUrl", () => {
  it("normalizes hostname casing, default ports, trailing slashes, and fragments", () => {
    expect(
      normalizeResourceUrl(" HTTPS://ExAmPlE.COM:443/products/item///?a=1#details "),
    ).toBe("https://example.com/products/item?a=1");
  });

  it("removes a root slash and fragment while preserving the query string", () => {
    expect(normalizeResourceUrl("https://example.com/?b=2&a=1#top")).toBe(
      "https://example.com?b=2&a=1",
    );
  });

  it("keeps query parameter order and values because they may identify distinct resources", () => {
    expect(normalizeResourceUrl("https://example.com/item?a=1&b=2")).not.toBe(
      normalizeResourceUrl("https://example.com/item?b=2&a=1"),
    );
    expect(
      normalizeResourceUrl("https://example.com/item?variant=one"),
    ).not.toBe(normalizeResourceUrl("https://example.com/item?variant=two"));
  });

  it("does not merge schemes or www hostnames", () => {
    expect(normalizeResourceUrl("http://example.com/item")).not.toBe(
      normalizeResourceUrl("https://example.com/item"),
    );
    expect(normalizeResourceUrl("https://www.example.com")).not.toBe(
      normalizeResourceUrl("https://example.com"),
    );
  });

  it("rejects relative, unsupported, and credential-bearing URLs", () => {
    for (const value of [
      "example.com/path",
      "javascript:alert(1)",
      "ftp://example.com/file",
      "https://user:pass@example.com/private",
    ]) {
      expect(() => normalizeResourceUrl(value)).toThrow(
        InvalidResourceUrlError,
      );
    }
  });

  it("provides a non-throwing URL predicate", () => {
    expect(isResourceUrl("https://example.com")).toBe(true);
    expect(isResourceUrl("mailto:hello@example.com")).toBe(false);
  });
});
