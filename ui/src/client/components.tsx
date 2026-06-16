import React, { useEffect, useState } from "react";
import { Activity, DollarSign, Download, RefreshCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { StatsBreakdownRow } from "../shared/types";
import type { Tone } from "./types";
import { currency, formatCell } from "./utils";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon" onClick={onClose} title="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Header({ icon, title, tone = "green", action }: { icon: React.ReactNode; title: string; tone?: Tone; action?: React.ReactNode }) {
  return <div className="header"><div className={`page-title ${tone}`}><span className="page-icon">{icon}</span><h1>{title}</h1></div>{action}</div>;
}

export function StatsActions({ exportHref, onRefresh }: { exportHref: string; onRefresh: () => void }) {
  return (
    <>
      <a className="secondary" href={exportHref} download><Download size={16} /> Download CSV</a>
      <button className="secondary" onClick={onRefresh}><RefreshCcw size={16} /> Refresh</button>
    </>
  );
}

export function Metric({ icon, tone, label, value }: { icon: React.ReactNode; tone: Tone; label: string; value: string }) {
  return <div className={`metric ${tone}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong>{value}</strong></div>;
}

export function Breakdown({ icon, tone, title, rows, onRowClick }: { icon: React.ReactNode; tone: Tone; title: string; rows: StatsBreakdownRow[]; onRowClick?: (row: StatsBreakdownRow) => void }) {
  return (
    <div className={`panel ${tone}`}>
      <PanelTitle icon={icon} title={title} />
      {rows.length ? rows.slice(0, 8).map((row) => {
        const content = <><span>{row.name}</span><strong>{currency(row.spend)}</strong></>;
        return onRowClick ? (
          <button className="bar-row clickable" key={row.id || row.name} onClick={() => onRowClick(row)}>{content}</button>
        ) : (
          <div className="bar-row" key={row.id || row.name}>{content}</div>
        );
      }) : <p className="muted">No data</p>}
    </div>
  );
}

const chartColors = ["#14745f", "#2563eb", "#d97706", "#7c3aed", "#e0526f", "#52605b"];

export function StatsCharts({ spendTitle, spendRows, modelRows, keyRows }: { spendTitle: string; spendRows: StatsBreakdownRow[]; modelRows: StatsBreakdownRow[]; keyRows: StatsBreakdownRow[] }) {
  return (
    <div className="chart-grid">
      <DonutChart title={spendTitle} rows={spendRows.slice(0, 6).map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] }))} />
      <DonutChart title="Spend by model %" rows={modelRows.slice(0, 6).map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] }))} showPercent />
      <SpendBarChart title="Spend by key" rows={keyRows.slice(0, 6)} color="#d97706" />
      <BarChart title="Requests by model" rows={modelRows.slice(0, 6)} color="#2563eb" />
    </div>
  );
}

function DonutChart({ title, rows, showPercent = false }: { title: string; rows: Array<StatsBreakdownRow & { color: string }>; showPercent?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.spend, 0);
  let offset = 0;
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<DollarSign size={16} />} title={title} />
      <div className="donut-layout">
        <svg className="donut-chart" viewBox="0 0 120 120" role="img" aria-label={title}>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#edf2f0" strokeWidth="18" />
          {total > 0 ? rows.map((row) => {
            const fraction = row.spend / total;
            const dash = fraction * 263.89;
            const segment = <circle key={row.name} cx="60" cy="60" r="42" fill="none" stroke={row.color} strokeWidth="18" strokeDasharray={`${dash} ${263.89 - dash}`} strokeDashoffset={-offset} pathLength="263.89" />;
            offset += dash;
            return segment;
          }) : null}
          <text x="60" y="56" textAnchor="middle" className="chart-value">{currency(total)}</text>
          <text x="60" y="72" textAnchor="middle" className="chart-label">total</text>
        </svg>
        <div className="chart-legend">
          {rows.map((row) => {
            const percent = total > 0 ? `${((row.spend / total) * 100).toFixed(1)}%` : "0.0%";
            return <div className="legend-row" key={row.name}><span className="legend-dot" style={{ background: row.color }} /> <span>{row.name}</span><strong>{showPercent ? percent : currency(row.spend)}</strong></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function SpendBarChart({ title, rows, color }: { title: string; rows: StatsBreakdownRow[]; color: string }) {
  const maxSpend = Math.max(0.000001, ...rows.map((row) => row.spend));
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<DollarSign size={16} />} title={title} />
      <div className="bar-chart" role="img" aria-label={title}>
        {rows.length ? rows.map((row) => (
          <div className="chart-bar-row" key={row.id || row.name}>
            <span title={row.name}>{row.name}</span>
            <div className="chart-bar-track"><div className="chart-bar-fill" style={{ width: `${Math.max(4, (row.spend / maxSpend) * 100)}%`, background: color }} /></div>
            <strong>{currency(row.spend)}</strong>
          </div>
        )) : <p className="muted">No spend</p>}
      </div>
    </div>
  );
}

function BarChart({ title, rows, color }: { title: string; rows: StatsBreakdownRow[]; color: string }) {
  const maxRequests = Math.max(1, ...rows.map((row) => row.requests));
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<Activity size={16} />} title={title} />
      <div className="bar-chart" role="img" aria-label={title}>
        {rows.length ? rows.map((row) => (
          <div className="chart-bar-row" key={row.id || row.name}>
            <span title={row.name}>{row.name}</span>
            <div className="chart-bar-track"><div className="chart-bar-fill" style={{ width: `${Math.max(4, (row.requests / maxRequests) * 100)}%`, background: color }} /></div>
            <strong>{row.requests}</strong>
          </div>
        )) : <p className="muted">No requests</p>}
      </div>
    </div>
  );
}

export function DataTable({ icon, title, rows, columns }: { icon: React.ReactNode; title: string; rows: Array<Record<string, unknown>>; columns: string[] }) {
  return <div className="panel wide"><PanelTitle icon={icon} title={title} /><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

export function PaginatedDataTable({ icon, title, rows, columns, pageSize = 10 }: { icon: React.ReactNode; title: string; rows: Array<Record<string, unknown>>; columns: string[]; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  return (
    <div className="panel wide">
      <div className="table-panel-head">
        <PanelTitle icon={icon} title={title} />
        <span className="muted">{rows.length ? `${start + 1}-${Math.min(start + pageSize, rows.length)} of ${rows.length}` : "0 logs"}</span>
      </div>
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row, index) => <tr key={start + index}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody>
      </table>
      <div className="pagination">
        <button className="secondary" onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>Previous</button>
        <span className="muted">Page {currentPage + 1} of {pageCount}</span>
        <button className="secondary" onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))} disabled={currentPage >= pageCount - 1}>Next</button>
      </div>
    </div>
  );
}

export function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <h2 className="panel-title"><span>{icon}</span>{title}</h2>;
}

export function StatusBadge({ blocked }: { blocked: boolean }) {
  return blocked ? <span className="status blocked"><ShieldCheck size={13} />Blocked</span> : <span className="status active"><Sparkles size={13} />Active</span>;
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
