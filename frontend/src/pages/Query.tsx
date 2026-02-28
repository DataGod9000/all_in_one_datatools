import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function Query() {
  const toast = useToast();
  const [querySql, setQuerySql] = useState('');
  const [queryResult, setQueryResult] = useState<
    | { columns: string[]; rows: unknown[][] }
    | { rows_affected: number }
    | null
  >(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleRun = async () => {
    if (!querySql.trim()) {
      toast('Enter a query.', 'error');
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
    const data = res.json;
    if (data?.rows_affected != null) {
      setQueryResult({ rows_affected: data.rows_affected });
      toast(`Success. ${data.rows_affected} row(s) affected.`, 'success');
    } else {
      setQueryResult({
        columns: data?.columns || [],
        rows: data?.rows || [],
      });
      toast(`Query returned ${(data?.rows?.length || 0)} row(s).`, 'success');
    }
  };

  return (
    <section id="view-query" className="section view query-page">
      <div className="query-layout">
        <aside className="query-sidebar">
          <h3 className="query-sidebar-title">SQL Editor</h3>
          <div className="query-sidebar-section">
            <button
              type="button"
              className="query-new-btn"
              onClick={() => {
                setQuerySql('');
                setQueryResult(null);
                setQueryError(null);
              }}
            >
              <span className="query-new-icon">+</span>
              New query
            </button>
          </div>
          <div className="query-sidebar-hint">
            <p>SELECT and INSERT allowed. SELECT: max 500 rows.</p>
          </div>
        </aside>

        <div className="query-main">
          <div className="query-editor-wrap">
            <div className="query-editor-header">
              <span className="query-editor-label">Query <kbd className="query-kbd">⌘↵</kbd></span>
              <button
                type="button"
                className="primary query-run-btn"
                onClick={handleRun}
                disabled={queryLoading || !querySql.trim()}
              >
                {queryLoading ? 'Running…' : 'Run'}
              </button>
            </div>
            <textarea
              className="query-sql-editor"
              value={querySql}
              onChange={(e) => setQuerySql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleRun();
                }
              }}
              placeholder="SELECT * FROM dev.your_table LIMIT 10"
              spellCheck={false}
            />
          </div>

          <div className="query-results-panel">
            <div className="query-results-header">
              <span className="query-results-label">Results</span>
              {queryResult && 'rows' in queryResult && (
                <span className="query-results-meta">{queryResult.rows.length} row(s)</span>
              )}
              {queryResult && 'rows_affected' in queryResult && (
                <span className="query-results-meta">{queryResult.rows_affected} row(s) affected</span>
              )}
            </div>
            <div className="query-results-body">
              {queryLoading && <p className="query-results-loading">Running query…</p>}
              {queryError && (
                <div className="query-results-error">
                  <p>{queryError}</p>
                </div>
              )}
              {!queryLoading && !queryError && !queryResult && (
                <p className="query-results-empty">Run a query to see results.</p>
              )}
              {!queryLoading && !queryError && queryResult && 'rows_affected' in queryResult && (
                <p className="query-results-success">Success. {queryResult.rows_affected} row(s) affected.</p>
              )}
              {!queryLoading && !queryError && queryResult && 'rows' in queryResult && (
                <div className="query-results-table-wrap">
                  <table className="query-results-table">
                    <thead>
                      <tr>
                        {queryResult.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((v, j) => (
                            <td key={j}>{v == null ? 'NULL' : String(v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
