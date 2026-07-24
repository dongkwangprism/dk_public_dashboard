import { describe, expect, it } from "vitest";
import {
  resolveApiBaseUrls,
  shouldFallbackToNextBaseUrl,
} from "./apiBaseUrls.js";

describe("resolveApiBaseUrls", () => {
  it("uses the same-origin Pages proxy before the configured Worker in production", () => {
    expect(resolveApiBaseUrls({
      configuredBaseUrl: "https://worker.example.com/",
      dev: false,
    })).toEqual([
      "/api/proxy",
      "https://worker.example.com",
    ]);
  });

  it("keeps the local Worker fallback behavior in development", () => {
    expect(resolveApiBaseUrls({ configuredBaseUrl: "", dev: true })).toEqual([
      "http://localhost:8787",
      "http://localhost:8788",
    ]);
  });

  it("falls back from proxy server errors but not client errors", () => {
    expect(shouldFallbackToNextBaseUrl("/api/proxy", 502)).toBe(true);
    expect(shouldFallbackToNextBaseUrl("/api/proxy", 500)).toBe(true);
    expect(shouldFallbackToNextBaseUrl("/api/proxy", 401)).toBe(false);
    expect(shouldFallbackToNextBaseUrl("https://worker.example.com", 502)).toBe(false);
  });
});
