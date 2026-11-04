import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "../services/passwords";
import { isSessionUsable } from "../services/auth";

describe("local authentication primitives", () => {
  it("hashes passwords and verifies only the matching password", async () => {
    const password = "a-long-test-password-that-is-not-used-for-an-account";
    const encoded = await hashPassword(password);
    assert.notEqual(encoded, password);
    assert.equal(await verifyPassword(password, encoded), true);
    assert.equal(await verifyPassword(`${password}-wrong`, encoded), false);
  });

  it("rejects expired, revoked, and disabled sessions", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    const active = {
      expiresAt: new Date("2026-10-25T13:00:00.000Z"),
      revokedAt: null,
      disabledAt: null,
    };
    assert.equal(isSessionUsable(active, now), true);
    assert.equal(isSessionUsable({ ...active, expiresAt: now }, now), false);
    assert.equal(isSessionUsable({ ...active, revokedAt: new Date() }, now), false);
    assert.equal(isSessionUsable({ ...active, disabledAt: new Date() }, now), false);
  });
});
