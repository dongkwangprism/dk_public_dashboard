import React, { useMemo, useState } from "react";
import {
  mergeUpcomingRows,
  mobileBidOpacity,
  mobileDdayTone,
  normalizeMobileTab,
} from "./mobileUtils.js";
import { MobileBidSheet } from "./MobileBidSheet.jsx";
import "./mobile.css";

const MOBILE_TABS = [
  { id: "bids", label: "공고", icon: "▤" },
  { id: "regions", label: "영업", icon: "⌖" },
  { id: "plans", label: "예정", icon: "▣" },
];

const STATUS_LABELS = {
  none: "미접촉",
  catalog_sent: "카탈로그 발송",
  called: "통화 완료",
  quoted: "견적 제출",
  ongoing: "진행 중",
  closed: "종료",
};

export function MobileApp({
  companyId,
  companies,
  onCompanyChange,
  tab,
  onTabChange,
  data,
  visibleState,
  loading = false,
  onRefresh,
  onAnalyze,
  selectedBid = null,
  onCloseAnalysis = () => {},
  analysisPending = false,
  analyzeBid = () => null,
  companyHistory = [],
  onRecordBid = () => {},
  salesNotes,
}) {
  const [floorRate, setFloorRate] = useState("87.995");
  const safeTab = normalizeMobileTab(tab);
  const urgentCount = (data.bids || []).filter((row) => row.openDday <= 3).length;
  const title = MOBILE_TABS.find((item) => item.id === safeTab)?.label || "공고";
  const bidAnalysis = useMemo(
    () => selectedBid ? analyzeBid(selectedBid, Number(floorRate)) : null,
    [selectedBid, analyzeBid, floorRate]
  );

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div>
          <span className="mobile-header-kicker">조달 대시보드</span>
          <div className="mobile-title-row">
            <h1>{title}</h1>
            {urgentCount > 0 && <span className="mobile-urgent">긴급 {urgentCount}</span>}
          </div>
        </div>
        <button
          type="button"
          className="mobile-icon-button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="새로고침"
        >
          {loading ? "…" : "↻"}
        </button>
      </header>

      <div className="mobile-company-chips" aria-label="회사 선택">
        {Object.entries(companies).map(([id, company]) => (
          <button
            type="button"
            key={id}
            className={companyId === id ? "is-active" : ""}
            aria-pressed={companyId === id}
            onClick={() => onCompanyChange(id)}
          >
            {company.label}
          </button>
        ))}
      </div>

      <main className="mobile-content">
        <MobileDataState state={visibleState} />
        {safeTab === "bids" && (
          <MobileBidList rows={data.bids || []} onAnalyze={onAnalyze} />
        )}
        {safeTab === "regions" && (
          <MobileSalesList
            rows={data.budgets || []}
            companyId={companyId}
            salesNotes={salesNotes}
          />
        )}
        {safeTab === "plans" && (
          <MobileUpcomingList plans={data.plans || []} specs={data.specs || []} />
        )}
      </main>

      <nav className="mobile-bottom-nav" role="tablist" aria-label="모바일 주요 메뉴">
        {MOBILE_TABS.map((item) => (
          <button
            type="button"
            key={item.id}
            role="tab"
            aria-selected={safeTab === item.id}
            className={safeTab === item.id ? "is-active" : ""}
            onClick={() => onTabChange(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {selectedBid && bidAnalysis && (
        <MobileBidSheet
          bid={selectedBid}
          analysis={bidAnalysis}
          pending={analysisPending}
          floorRate={floorRate}
          onFloorRateChange={setFloorRate}
          onClose={onCloseAnalysis}
          onRecord={(draft) => onRecordBid(selectedBid, draft)}
          companyHistory={companyHistory}
        />
      )}
    </div>
  );
}

function MobileDataState({ state }) {
  if (!state || state.mode === "live" || state.mode === "cache") return null;
  return (
    <div className={`mobile-data-state is-${state.mode}`} role="status">
      <strong>{state.mode === "error" ? "데이터를 불러오지 못했습니다" : "데이터 확인 중"}</strong>
      {state.status && <span>{state.status}</span>}
    </div>
  );
}

function MobileBidList({ rows, onAnalyze }) {
  if (!rows.length) return <MobileEmpty>현재 확인할 공고가 없습니다.</MobileEmpty>;
  return (
    <div className="mobile-card-list">
      {rows.map((row) => (
        <article
          key={row.id || row.bidNo || row.name}
          className="mobile-card mobile-bid-card"
          style={{ opacity: mobileBidOpacity(row.openDday) }}
          role="button"
          tabIndex={0}
          onClick={() => onAnalyze(row)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onAnalyze(row);
          }}
        >
          <div className="mobile-card-heading">
            <h2>{row.name}</h2>
            <span className={`mobile-dday is-${mobileDdayTone(row.openDday)}`}>
              {formatDday(row.openDday)}
            </span>
          </div>
          <p className="mobile-muted">{row.org || "기관 미상"}</p>
          <strong className="mobile-money">{formatMoney(row.budget)}</strong>
          <button
            type="button"
            className="mobile-primary-action"
            onClick={(event) => {
              event.stopPropagation();
              onAnalyze(row);
            }}
          >
            투찰 분석
          </button>
          {row.url && (
            <a
              className="mobile-text-link"
              href={row.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              공고 원문
            </a>
          )}
        </article>
      ))}
    </div>
  );
}

function MobileSalesList({ rows, companyId, salesNotes }) {
  const [openKey, setOpenKey] = useState("");
  const productRows = rows
    .filter((row) => row.bizType !== "service")
    .sort((a, b) => b.lagIndex - a.lagIndex);

  if (!productRows.length) return <MobileEmpty>현재 확인할 영업 대상이 없습니다.</MobileEmpty>;

  const notes = salesNotes?.notes || {};
  const saveNote = salesNotes?.saveNote || (() => {});

  return (
    <div className="mobile-card-list">
      {productRows.map((row) => {
        const key = `${companyId}|${row.org}|${row.bizName}`;
        const note = notes[key] || { status: "none", memo: "" };
        const isOpen = openKey === key;
        return (
          <article key={row.id || key} className="mobile-card">
            <div className="mobile-card-heading">
              <span className={`mobile-grade is-${row.grade || "watch"}`}>
                {gradeLabel(row.grade)}
              </span>
              <strong className="mobile-lag">지연 {Math.round(row.lagIndex)}p</strong>
            </div>
            <h2>{row.org}</h2>
            <p className="mobile-card-copy">{row.bizName}</p>
            <div className="mobile-sales-metrics">
              <span>잔액 <strong>{formatMoney(row.remaining)}</strong></span>
              <span>집행률 <strong>{Number(row.execRate || 0).toFixed(0)}%</strong></span>
            </div>
            <button
              type="button"
              className="mobile-secondary-action"
              onClick={() => setOpenKey(isOpen ? "" : key)}
              aria-expanded={isOpen}
            >
              {STATUS_LABELS[note.status] || "미접촉"} · 영업 메모
            </button>
            {isOpen && (
              <div className="mobile-note-editor">
                <select
                  value={note.status || "none"}
                  onChange={(event) => saveNote(key, { status: event.target.value }, companyId)}
                  aria-label={`${row.org} 영업 상태`}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <textarea
                  value={note.memo || ""}
                  onChange={(event) => saveNote(key, { memo: event.target.value }, companyId)}
                  placeholder="담당자명, 통화 내용, 특이사항"
                  aria-label={`${row.org} 영업 메모`}
                />
                {salesNotes?.syncStatus && <small>{salesNotes.syncStatus}</small>}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function MobileUpcomingList({ plans, specs }) {
  const rows = useMemo(() => mergeUpcomingRows(plans, specs), [plans, specs]);
  if (!rows.length) return <MobileEmpty>현재 확인할 예정 항목이 없습니다.</MobileEmpty>;

  return (
    <div className="mobile-card-list">
      {rows.map((row) => (
        <article key={`${row.kind}-${row.id}`} className="mobile-card">
          <div className="mobile-card-heading">
            <span className={`mobile-kind is-${row.kind}`}>
              {row.kind === "spec" ? "사전규격" : "발주계획"}
            </span>
            <span className={`mobile-dday is-${mobileDdayTone(row.dday)}`}>
              {row.kind === "spec" ? "마감 " : "예정 "}{formatDday(row.dday)}
            </span>
          </div>
          <h2>{row.product}</h2>
          <p className="mobile-muted">{row.org || "기관 미상"}</p>
          {row.kind === "spec" ? (
            <>
              <p className="mobile-card-copy">{row.summary || "규격 요약이 없습니다."}</p>
              {row.url && (
                <a className="mobile-primary-action is-link" href={row.url} target="_blank" rel="noreferrer">
                  의견 제출 확인
                </a>
              )}
            </>
          ) : (
            <div className="mobile-sales-metrics">
              <span>예정금액 <strong>{formatMoney(row.amount)}</strong></span>
              <span>공고기관 <strong>{row.noticeOrg || "-"}</strong></span>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function MobileEmpty({ children }) {
  return <div className="mobile-empty">{children}</div>;
}

function formatDday(value) {
  if (!Number.isFinite(value)) return "일정 미정";
  if (value === 0) return "D-DAY";
  return value > 0 ? `D-${value}` : `D+${Math.abs(value)}`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (amount >= 100_000_000) return `${(amount / 100_000_000).toFixed(amount % 100_000_000 ? 1 : 0)}억원`;
  if (amount >= 10_000) return `${Math.round(amount / 10_000).toLocaleString("ko-KR")}만원`;
  return `${amount.toLocaleString("ko-KR")}원`;
}

function gradeLabel(grade) {
  return {
    now: "즉시 영업",
    active: "적극 접촉",
    watch: "관찰",
    hold: "보류",
  }[grade] || "관찰";
}
