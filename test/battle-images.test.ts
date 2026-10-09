import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/zap-live/sessions/[sessionId]/images/route";

test("image writes fail closed without configured admin authentication and reject an invalid token", async () => {
  const previous = process.env.ADMIN_TOKEN;
  try {
    delete process.env.ADMIN_TOKEN;
    const context = { params: Promise.resolve({ sessionId: "test" }) };
    assert.equal((await POST(new NextRequest("http://localhost/images", { method: "POST" }), context)).status, 503);
    process.env.ADMIN_TOKEN = "test-admin";
    assert.equal((await POST(new NextRequest("http://localhost/images", { method: "POST", headers: { "x-admin-token": "wrong" } }), context)).status, 401);
  } finally { if (previous === undefined) delete process.env.ADMIN_TOKEN; else process.env.ADMIN_TOKEN = previous; }
});

import sharp from "sharp";
import { optimizeBattleImage } from "../src/server/battle-image";

test("uploaded images become bounded WebP without EXIF metadata", async () => {
  const input = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: "red" } }).jpeg().withMetadata().toBuffer();
  const output = await optimizeBattleImage(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 960);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(optimizeBattleImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"></svg>')));
  await assert.rejects(optimizeBattleImage(Buffer.from("not an image")));
});
