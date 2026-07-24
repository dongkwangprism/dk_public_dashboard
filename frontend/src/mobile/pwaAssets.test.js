import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA assets", () => {
  it("declares standalone manifest icons", () => {
    const manifest = JSON.parse(
      fs.readFileSync("public/manifest.webmanifest", "utf8")
    );

    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
  });

  it("links the manifest and apple icon", () => {
    const html = fs.readFileSync("index.html", "utf8");

    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icon-192.png"');
  });
});
