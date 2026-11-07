import assert from "node:assert/strict";
import { basename } from "node:path";
import { test } from "node:test";
import {
  getSafeMediaPath,
  InvalidMediaFileError,
  MediaNotFoundError,
  validateMediaPayload,
} from "../services/media-management";

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

test("media upload validates safe filename, type, size, and file signature", () => {
  assert.deepEqual(
    validateMediaPayload(
      {
        fileName: "cover image.png",
        contentType: "image/png",
        sizeBytes: pngSignature.length,
      },
      pngSignature,
    ),
    {
      fileName: "cover image.png",
      contentType: "image/png",
      sizeBytes: pngSignature.length,
    },
  );

  assert.throws(
    () =>
      validateMediaPayload(
        {
          fileName: "../../private.png",
          contentType: "image/png",
          sizeBytes: pngSignature.length,
        },
        pngSignature,
      ),
    InvalidMediaFileError,
  );
  assert.throws(
    () =>
      validateMediaPayload(
        {
          fileName: "cover.jpg",
          contentType: "image/png",
          sizeBytes: pngSignature.length,
        },
        pngSignature,
      ),
    InvalidMediaFileError,
  );
  assert.throws(
    () =>
      validateMediaPayload(
        {
          fileName: "cover.png",
          contentType: "image/png",
          sizeBytes: pngSignature.length,
        },
        Buffer.from("not an image"),
      ),
    InvalidMediaFileError,
  );
  assert.throws(
    () =>
      validateMediaPayload(
        {
          fileName: "large.png",
          contentType: "image/png",
          sizeBytes: 10 * 1024 * 1024 + 1,
        },
        Buffer.alloc(1),
      ),
    InvalidMediaFileError,
  );
});

test("media storage accepts only generated safe keys", () => {
  const safePath = getSafeMediaPath(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
  );
  assert.equal(basename(safePath), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png");
  assert.throws(() => getSafeMediaPath("../outside.png"), MediaNotFoundError);
  assert.throws(
    () => getSafeMediaPath("canonical-byteclave-logo.svg"),
    MediaNotFoundError,
  );
});
