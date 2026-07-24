// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileBidSheet } from "./MobileBidSheet.jsx";

const analysis = {
  displayRates: [87.91, 87.95, 88.02],
  productRates: [87.91, 87.95, 88.02],
  competitors: [{ name: "경쟁사A", count: 2, avgRate: 87.95 }],
  recommendations: {
    aggressive: 88,
    standard: 88.02,
    safe: 88.05,
  },
  comment: "",
  confidenceLabel: "기관·품목 병행",
  scopeMessage: "기관 표본과 품목 분포를 함께 표시합니다.",
};

afterEach(cleanup);

describe("MobileBidSheet", () => {
  it("uses decimal input and closes from the overlay", () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileBidSheet
        bid={{ name: "공고", org: "기관", budget: 1_000_000 }}
        analysis={analysis}
        floorRate="87.995"
        onFloorRateChange={() => {}}
        onClose={onClose}
        onRecord={() => {}}
        companyHistory={[]}
      />
    );

    const input = screen.getByLabelText("낙찰하한율");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("pattern")).toBe("[0-9.]*");
    fireEvent.mouseDown(container.querySelector(".mobile-sheet-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits a bid record from the sheet", () => {
    const onRecord = vi.fn();
    render(
      <MobileBidSheet
        bid={{ name: "공고", org: "기관", budget: 1_000_000 }}
        analysis={analysis}
        floorRate="87.995"
        onFloorRateChange={() => {}}
        onClose={() => {}}
        onRecord={onRecord}
        companyHistory={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "이번 투찰 기록" }));
    fireEvent.change(screen.getByLabelText("우리 투찰가"), { target: { value: "880000" } });
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));

    expect(onRecord).toHaveBeenCalledWith({ myPrice: 880000, result: "lost" });
  });
});
