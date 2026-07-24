import React, { useEffect, useMemo, useRef, useState } from "react";

export function MobileBidSheet({
  bid,
  analysis,
  pending = false,
  floorRate,
  onFloorRateChange,
  onClose,
  onRecord,
  companyHistory = [],
}) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordDraft, setRecordDraft] = useState({ myPrice: "", result: "lost" });
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartRef = useRef(null);
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  closeRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.history.pushState({ mobileBidSheet: true }, "");

    const handleBack = () => {
      if (closingRef.current) return;
      closingRef.current = true;
      closeRef.current();
    };
    const handleKey = (event) => {
      if (event.key === "Escape") closeSheet();
    };
    window.addEventListener("popstate", handleBack);
    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", handleBack);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const bars = useMemo(
    () => buildMobileRateBars(analysis?.displayRates || []),
    [analysis?.displayRates]
  );

  const closeSheet = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    closeRef.current();
    window.history.back();
  };

  const submitRecord = () => {
    const myPrice = Number(String(recordDraft.myPrice).replace(/,/g, ""));
    if (!Number.isFinite(myPrice) || myPrice <= 0) return;
    onRecord({ myPrice, result: recordDraft.result });
    setRecordOpen(false);
    setRecordDraft({ myPrice: "", result: "lost" });
  };

  const onTouchStart = (event) => {
    touchStartRef.current = event.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (event) => {
    if (touchStartRef.current === null) return;
    setDragOffset(Math.max(0, (event.touches[0]?.clientY || 0) - touchStartRef.current));
  };
  const onTouchEnd = () => {
    if (dragOffset >= 80) closeSheet();
    setDragOffset(0);
    touchStartRef.current = null;
  };

  return (
    <div
      className="mobile-sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeSheet();
      }}
    >
      <section
        className="mobile-bid-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${bid.name} 투찰 분석`}
        style={{ transform: `translateY(${dragOffset}px)` }}
      >
        <div
          className="mobile-sheet-drag-zone"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="mobile-sheet-handle" aria-hidden="true" />
        </div>

        <div className="mobile-sheet-scroll">
          <header className="mobile-sheet-header">
            <div>
              <span>공고별 투찰 분석</span>
              <h2>{bid.name}</h2>
              <p>{bid.org} · 기초금액 {formatWon(bid.budget)}</p>
            </div>
            <button type="button" onClick={closeSheet} aria-label="투찰 분석 닫기">×</button>
          </header>

          <section className="mobile-sheet-section">
            <label className="mobile-floor-field">
              <strong>낙찰하한율</strong>
              <span>
                <input
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9.]*"
                  value={floorRate}
                  onChange={(event) => onFloorRateChange(event.target.value)}
                  aria-label="낙찰하한율"
                />
                %
              </span>
            </label>
            <small>공고문에 명시된 값을 확인해 입력하세요.</small>
          </section>

          {pending ? (
            <div className="mobile-sheet-loading">낙찰 이력을 분석하고 있습니다.</div>
          ) : (
            <>
              <section className="mobile-sheet-section">
                <div className="mobile-sheet-title-row">
                  <h3>이 기관 낙찰률 분포</h3>
                  {analysis?.confidenceLabel && <span>{analysis.confidenceLabel}</span>}
                </div>
                {analysis?.scopeMessage && <p className="mobile-sheet-help">{analysis.scopeMessage}</p>}
                {bars.length ? (
                  <div className="mobile-rate-bars">
                    {bars.map((bar) => (
                      <div key={bar.label}>
                        <span>{bar.label}</span>
                        <div><i style={{ width: `${bar.width}%` }} /></div>
                        <strong>{bar.count}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mobile-sheet-empty">표시할 낙찰률 표본이 없습니다.</p>
                )}
              </section>

              <RecommendationCards analysis={analysis} budget={bid.budget} />

              <section className="mobile-sheet-section">
                <h3>경쟁사 요약</h3>
                {(analysis?.competitors || []).slice(0, 2).map((item) => (
                  <div className="mobile-competitor-row" key={item.name}>
                    <strong>{item.name}</strong>
                    <span>{item.count}회 낙찰 · 평균 {item.avgRate.toFixed(3)}%</span>
                  </div>
                ))}
                {!analysis?.competitors?.length && (
                  <p className="mobile-sheet-empty">확인된 경쟁사 이력이 없습니다.</p>
                )}
              </section>
            </>
          )}

          <section className="mobile-sheet-section">
            <button
              type="button"
              className="mobile-sheet-record-button"
              onClick={() => setRecordOpen((value) => !value)}
              aria-expanded={recordOpen}
            >
              이번 투찰 기록
            </button>
            {recordOpen && (
              <div className="mobile-sheet-record-form">
                <input
                  type="text"
                  inputMode="numeric"
                  value={recordDraft.myPrice}
                  onChange={(event) => setRecordDraft({ ...recordDraft, myPrice: event.target.value })}
                  placeholder="우리 투찰가 (원)"
                  aria-label="우리 투찰가"
                />
                <select
                  value={recordDraft.result}
                  onChange={(event) => setRecordDraft({ ...recordDraft, result: event.target.value })}
                  aria-label="투찰 결과"
                >
                  <option value="lost">패찰</option>
                  <option value="won">낙찰</option>
                </select>
                <button type="button" onClick={submitRecord}>기록 저장</button>
              </div>
            )}
          </section>

          <details className="mobile-sheet-details">
            <summary>품목 전체 분포 · 우리 과거 이력</summary>
            <p>품목 전체 표본 {(analysis?.productRates || []).length}건</p>
            {companyHistory.length ? companyHistory.map((item, index) => (
              <div key={`${item.createdAt}-${index}`}>
                <strong>{item.createdAt} · {item.bidName || item.bidNo}</strong>
                <span>{formatWon(item.myPrice)} · {item.result === "won" ? "낙찰" : "패찰"}</span>
              </div>
            )) : <p>이 기관에 기록한 투찰 이력이 없습니다.</p>}
          </details>

          <div className="mobile-sheet-warning">
            낙찰하한율 미만 투찰은 무효입니다. 예상 금액은 기초금액 기준 참고치입니다.
          </div>
        </div>
      </section>
    </div>
  );
}

function RecommendationCards({ analysis, budget }) {
  const recommendations = analysis?.recommendations;
  if (!recommendations) {
    return (
      <section className="mobile-sheet-section">
        <h3>권장 투찰 3구간</h3>
        <p className="mobile-sheet-empty">유효한 하한율을 입력하면 계산합니다.</p>
      </section>
    );
  }
  const rows = [
    ["공격", recommendations.aggressive],
    ["표준", recommendations.standard],
    ["안전", recommendations.safe],
  ];
  return (
    <section className="mobile-sheet-section">
      <h3>권장 투찰 3구간</h3>
      <div className="mobile-recommendations">
        {rows.map(([label, rate]) => (
          <div key={label}>
            <strong>{label}</strong>
            <span>{rate.toFixed(3)}%</span>
            <b>{formatWon((Number(budget) || 0) * rate / 100)}</b>
          </div>
        ))}
      </div>
      {analysis.comment && <p className="mobile-sheet-comment">{analysis.comment}</p>}
    </section>
  );
}

function buildMobileRateBars(rates) {
  if (!rates.length) return [];
  const sorted = [...rates].sort((a, b) => a - b);
  const groupSize = Math.max(1, Math.ceil(sorted.length / 5));
  const groups = [];
  for (let index = 0; index < sorted.length; index += groupSize) {
    const values = sorted.slice(index, index + groupSize);
    groups.push({
      label: values.length === 1
        ? `${values[0].toFixed(2)}%`
        : `${values[0].toFixed(2)}–${values[values.length - 1].toFixed(2)}%`,
      count: values.length,
    });
  }
  const max = Math.max(...groups.map((group) => group.count));
  return groups.map((group) => ({ ...group, width: group.count / max * 100 }));
}

function formatWon(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}원`;
}
