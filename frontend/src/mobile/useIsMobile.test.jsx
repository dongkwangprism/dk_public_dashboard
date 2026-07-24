// @vitest-environment jsdom
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useIsMobile } from "./useIsMobile.js";

let listener;
let matches;

beforeEach(() => {
  listener = undefined;
  matches = true;
  window.matchMedia = vi.fn(() => ({
    matches,
    addEventListener: (_name, callback) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
  }));
});

it("tracks the 767px media query", () => {
  function Probe() {
    return <span>{useIsMobile() ? "mobile" : "desktop"}</span>;
  }

  render(<Probe />);
  expect(screen.getByText("mobile")).toBeTruthy();
  expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");

  act(() => listener({ matches: false }));
  expect(screen.getByText("desktop")).toBeTruthy();
});
