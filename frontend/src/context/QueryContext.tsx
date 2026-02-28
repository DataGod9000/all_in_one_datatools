import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useToast } from './ToastContext';

interface QueryContextType {
  openQuery: () => void;
}

const QueryContext = createContext<QueryContextType | null>(null);

export function QueryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openQuery = useCallback(() => setOpen(true), []);
  const closeQuery = useCallback(() => setOpen(false), []);

  return (
    <QueryContext.Provider value={{ openQuery }}>
      {children}
      {open && (
        <QueryModal onClose={closeQuery} />
      )}
    </QueryContext.Provider>
  );
}

export function useQuery() {
  const ctx = useContext(QueryContext);
  return ctx?.openQuery ?? (() => {});
}

function QueryModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [querySql, setQuerySql] = useState('');
  const [queryResult, setQueryResult] = useState<{ columns: string[]; rows: any[][] } | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!querySql.trim()) {
      toast('Enter a SELECT query.', 'error');
      return;
    }
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    const res = await api('/query/run', { sql: querySql.trim() });
    setQueryLoading(false);
    if (!res.ok) {
      setQueryError(res.json?.detail || 'Query failed');
      toast(res.json?.detail || 'Query failed', 'error');
      return;
    }
    setQueryResult({ columns: res.json?.columns || [], rows: res.json?.rows || [] });
    toast('Query returned ' + (res.json?.rows?.length || 0) + ' row(s).', 'success');
  };

  return (
    <div className="modal-overlay visible" onClick={onClose}>
      <div className="modal-card modal-query" onClick={(e) => e.stopPropagation()}>
        <div className="modal-query-header">
          <h3>Run query</h3>
          <button type="button" className="modal-query-close" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-query-hint">Read-only SELECT. Max 500 rows. <code>LIMIT 500</code> added if missing.</p>
        <textarea className="query-sql-input" value={querySql} onChange={(e) => setQuerySql(e.target.value)} placeholder="SELECT * FROM ..." />
        <button type="button" className="modal-btn primary" onClick={handleRun}>Run</button>
        {queryLoading && <p className="query-results-loading">Loading…</p>}
        {queryError && <p className="query-results-error">{queryError}</p>}
        {queryResult && (
          <div className="query-results-wrap">
            <p className="query-results-meta">{queryResult.rows.length} row(s)</p>
            <div className="query-results-table-wrap">
              <table className="query-results-table">
                <thead><tr>{queryResult.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {queryResult.rows.map((row, i) => (
                    <tr key={i}>{row.map((v, j) => <td key={j}>{v == null ? 'NULL' : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
