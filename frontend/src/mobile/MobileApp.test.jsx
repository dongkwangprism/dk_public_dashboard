// @vitest-environment jsdom
import React from "react";
import fs from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileApp } from "./MobileApp.jsx";

describe("MobileApp", () => {
  it("renders only the three mobile tabs and changes tabs", () => {
    const onTabChange = vi.fn();
    render(
      <MobileApp
        companyId="jeil"
        companies={{
          jeil: { label: "제일테크" },
          dongkwang: { label: "동광프리즘" },
        }}
        onCompanyChange={() => {}}
        tab="bids"
        onTabChange={onTabChange}
        data={{ bids: [], budgets: [], plans: [], specs: [] }}
        visibleState={{ mode: "live", status: "" }}
        onRefresh={() => {}}
        onAnalyze={() => {}}
        salesNotes={{ notes: {}, saveNote: () => {}, syncStatus: "" }}
      />
    );

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByText("경쟁사 분석")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /영업/ }));
    expect(onTabChange).toHaveBeenCalledWith("regions");
  });

  it("renders bid cards without a table", () => {
    const { container } = render(
      <MobileApp
        companyId="jeil"
        companies={{ jeil: { label: "제일테크" } }}
        onCompanyChange={() => {}}
        tab="bids"
        onTabChange={() => {}}
        data={{
          bids: [{
            id: "bid-1",
            name: "흡연부스 제작 설치",
            org: "인천국제공항공사",
            budget: 32_000_000,
            openDday: 2,
          }],
          budgets: [],
          plans: [],
          specs: [],
        }}
        visibleState={{ mode: "live", status: "" }}
        onRefresh={() => {}}
        onAnalyze={() => {}}
        salesNotes={{ notes: {}, saveNote: () => {}, syncStatus: "" }}
      />
    );

    expect(screen.getByText("흡연부스 제작 설치")).toBeTruthy();
    expect(screen.getByRole("button", { name: "투찰 분석" })).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });

  it("removes the loading root padding only while mobile UI is mounted", () => {
    const css = fs.readFileSync("src/mobile/mobile.css", "utf8");
    expect(css).toContain("body:has(.mobile-app) #root");
    expect(css).toMatch(/body:has\(\.mobile-app\) #root\s*\{[^}]*padding:\s*0/s);
  });
});
