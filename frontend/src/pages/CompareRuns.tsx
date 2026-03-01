import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getApi, api } from '../api';
import { useToast } from '../context/ToastContext';
import { AppSelect } from '../components/AppSelect';

interface CompareRun {
  id: number;
  left_table: string;
  right_table: string;
  env_schema: string;
  left_env_schema?: string;
  right_env_schema?: string;
  left_pt?: string;
  right_pt?: string;
  join_keys: string[];
  compare_columns: string[];
  result_json: {
    left_count?: number;
    right_count?: number;
    missing_in_right?: number;
    missing_in_left?: number;
    sample?: unknown[];
    column_diffs?: {
      left_col: string;
      right_col: string;
      total_compared: number;
      diff_count: number;
      sample: Record<string, unknown>[];
    }[];
  } | null;
  status: 'completed' | 'error';
  error_message: string | null;
  created_at: string;
}

function fmtDate(s: string | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return '—';
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <span className="status-badge status-completed">Ready</span>;
    case 'error':
      return <span className="status-badge status-error">Error</span>;
    case 'pending':
      return <span className="status-badge status-pending">Comparing…</span>;
    default:
      return <span className="status-badge status-pending">{status}</span>;
  }
}

function parseColumnPairs(arr: string[] | undefined): { left: string; right: string }[] {
  if (!arr?.length) return [];
  return arr.map((s) => {
    if (s.includes(':')) {
      const [left, right] = s.split(':');
      return { left: left || '', right: right || '' };
    }
    return { left: s, right: s };
  });
}

export default function CompareRuns() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [runs, setRuns] = useState<CompareRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState('');
  const [detailsOpen, setDetailsOpen] = useState<CompareRun | null>(null);
  const watchedRunIdRef = useRef<number | null>(null);

  const loadRuns = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    const params = envFilter ? `?env_schema=${encodeURIComponent(envFilter)}` : '';
    getApi('/compare/runs' + params)
      .then((res) => {
        setLoading(false);
        const newRuns = (res.ok && res.json?.runs) ? res.json.runs : [];
        setRuns(newRuns);

        const watchedId = watchedRunIdRef.current;
        if (watchedId) {
          const run = newRuns.find((r) => r.id === watchedId);
          if (run && run.status === 'completed') {
            toast('Comparison completed. Click Details to view results.', 'success');
            watchedRunIdRef.current = null;
          } else if (run && run.status === 'error') {
            toast('Comparison failed. Click Details for error.', 'error');
            watchedRunIdRef.current = null;
          }
        }
      })
      .catch(() => {
        setLoading(false);
        setRuns([]);
      });
  }, [envFilter, toast]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  const { openRunId, submitPayload } = (location.state || {}) as { openRunId?: number; submitPayload?: Record<string, unknown> };
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!submitPayload || submittedRef.current) return;
    submittedRef.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    api('/compare/run', submitPayload)
      .then((res) => {
        if (res.ok && res.json?.run_id != null) {
          toast('Comparison started. You will be notified when it completes.', 'success');
          watchedRunIdRef.current = res.json.run_id;
          loadRuns(false);
        } else {
          const detail = res.json?.detail;
          let msg = 'Failed to start comparison';
          if (Array.isArray(detail)) {
            msg = detail.map((e: { msg?: string; loc?: unknown[] }) => {
              const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== 'body').join('.') : '';
              return loc ? `${loc}: ${e.msg ?? 'error'}` : (e.msg ?? 'error');
            }).join('; ');
          } else if (typeof detail === 'string') {
            msg = detail;
          } else if (detail && typeof detail === 'object') {
            msg = JSON.stringify(detail);
          }
          toast(msg, 'error');
        }
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : 'Network error. Is the backend running (uvicorn main:app --port 8000)?', 'error');
      });
  }, [submitPayload, location.pathname, navigate, toast, loadRuns]);

  useEffect(() => {
    if (!openRunId || runs.length === 0) return;
    const run = runs.find((r) => r.id === openRunId);
    if (run) {
      setDetailsOpen(run);
      if (run.status === 'pending') watchedRunIdRef.current = openRunId;
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [openRunId, runs, location.pathname, navigate]);

  useEffect(() => {
    if (detailsOpen?.status === 'pending') {
      watchedRunIdRef.current = detailsOpen.id;
    }
  }, [detailsOpen?.id, detailsOpen?.status]);

  const hasPending = runs.some((r) => r.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => loadRuns(false), 2000);
    return () => clearInterval(id);
  }, [hasPending, loadRuns]);

  return (
    <section id="view-compare-runs" className="section view">
      <h2>Comparison runs</h2>
      <p className="subtitle">Submitted table comparisons. View status and results.</p>
      <div className="card">
        <div className="assets-toolbar">
          <div className="assets-toolbar-controls">
            <div className="assets-toolbar-row">
              <AppSelect
                className="assets-env-select"
                value={envFilter}
                onChange={setEnvFilter}
                options={[
                  { value: 'dev', label: 'dev' },
                  { value: 'prod', label: 'prod' },
                ]}
                placeholder="All environments"
                aria-label="Filter by environment"
              />
              <button type="button" className="primary" onClick={() => navigate('/compare')}>
                New comparison
              </button>
            </div>
          </div>
        </div>
        <div className="assets-list">
          {loading && <p className="text-muted">Loading…</p>}
          {!loading && runs.length === 0 && (
            <p className="text-muted">No comparison runs yet. Go to Compare to submit one.</p>
          )}
          {!loading && runs.length > 0 && (
            <div className="assets-table-wrap">
              <table className="assets-table">
                <thead>
                  <tr>
                    <th>Left table</th>
                    <th>Right table</th>
                    <th>Left env</th>
                    <th>Right env</th>
                    <th>Left PT</th>
                    <th>Right PT</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td><span className="table-name">{r.left_table}</span></td>
                      <td><span className="table-name">{r.right_table}</span></td>
                      <td>{r.left_env_schema ?? r.env_schema ?? 'dev'}</td>
                      <td>{r.right_env_schema ?? r.env_schema ?? 'dev'}</td>
                      <td>{r.left_pt ?? '—'}</td>
                      <td>{r.right_pt ?? '—'}</td>
                      <td>{statusBadge(r.status)}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td>
                        <button
                          type="button"
                          className="modal-btn secondary small"
                          onClick={() => setDetailsOpen(r)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailsOpen && (
        <div className="modal-overlay visible" onClick={() => setDetailsOpen(null)}>
          <div className="modal-card modal-details" onClick={(e) => e.stopPropagation()}>
            <div className="compare-details-header">
              <div className="compare-details-title-row">
                <span className="details-label">Left</span>
                <code className="compare-details-table">
                  {detailsOpen.left_env_schema ?? detailsOpen.env_schema}.{detailsOpen.left_table}
                  {detailsOpen.left_pt ? ` (PT ${detailsOpen.left_pt})` : ''}
                </code>
              </div>
              <div className="compare-details-vs">vs</div>
              <div className="compare-details-title-row">
                <span className="details-label">Right</span>
                <code className="compare-details-table">
                  {detailsOpen.right_env_schema ?? detailsOpen.env_schema}.{detailsOpen.right_table}
                  {detailsOpen.right_pt ? ` (PT ${detailsOpen.right_pt})` : ''}
                </code>
              </div>
            </div>
            <div className="details-stats">
              <div className="details-row">
                <span className="details-label">Status</span>
                <span>{statusBadge(detailsOpen.status)}</span>
              </div>
              <div className="details-row details-row-columns">
                <span className="details-label">Join keys</span>
                <div className="details-pairs-wrap">
                  {parseColumnPairs(detailsOpen.join_keys).length > 0
                    ? parseColumnPairs(detailsOpen.join_keys).map((p, i) => (
                        <span key={i} className="details-pair-tag">{p.left} ↔ {p.right}</span>
                      ))
                    : '—'}
                </div>
              </div>
              <div className="details-row details-row-columns">
                <span className="details-label">Compare columns</span>
                <div className="details-pairs-wrap">
                  {parseColumnPairs(detailsOpen.compare_columns).length > 0
                    ? parseColumnPairs(detailsOpen.compare_columns).map((p, i) => (
                        <span key={i} className="details-pair-tag">{p.left} ↔ {p.right}</span>
                      ))
                    : '—'}
                </div>
              </div>
            </div>
            <div className="modal-details-body">
            {detailsOpen.status === 'pending' && (
              <p className="text-muted">Comparison in progress… Results will appear when complete.</p>
            )}
            {detailsOpen.status === 'error' && detailsOpen.error_message && (
              <div className="result-box error">
                <p>{detailsOpen.error_message}</p>
              </div>
            )}
            {detailsOpen.status === 'completed' && detailsOpen.result_json && (
              <>
                {detailsOpen.result_json.column_diffs && detailsOpen.result_json.column_diffs.length > 0 ? (
                  <>
                    <h4 className="details-sample-title">Column-wise comparison</h4>
                    <div className="column-diffs-list">
                      {detailsOpen.result_json.column_diffs.map((cd, i) => (
                        <div key={i} className="column-diff-card">
                          <div className="column-diff-header">
                            <strong>{cd.left_col} ↔ {cd.right_col}</strong>
                            <span className="column-diff-stats">
                              {Number(cd.diff_count).toLocaleString()} differences of {Number(cd.total_compared).toLocaleString()} rows compared
                            </span>
                          </div>
                          {cd.sample && cd.sample.length > 0 && (
                            <div className="column-diff-sample">
                              <div className="details-sample-wrap overflow-auto">
                                <table className="query-results-table compact">
                                  <thead>
                                    <tr>
                                      <th>Left ({cd.left_col})</th>
                                      <th>Right ({cd.right_col})</th>
                                      {Object.keys(cd.sample[0] || {}).filter((k) => k !== 'left_val' && k !== 'right_val').map((k) => (
                                        <th key={k}>{k}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {cd.sample.map((row, ri) => (
                                      <tr key={ri}>
                                        <td className={String(row.left_val) !== String(row.right_val) ? 'diff-cell' : ''}>
                                          {row.left_val == null ? 'NULL' : String(row.left_val)}
                                        </td>
                                        <td className={String(row.left_val) !== String(row.right_val) ? 'diff-cell' : ''}>
                                          {row.right_val == null ? 'NULL' : String(row.right_val)}
                                        </td>
                                        {(Object.keys(row) as (keyof typeof row)[])
                                          .filter((k) => k !== 'left_val' && k !== 'right_val')
                                          .map((k) => (
                                            <td key={String(k)}>{row[k] != null ? String(row[k]) : 'NULL'}</td>
                                          ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-muted">No column-wise results. Select compare columns when submitting a comparison.</p>
                )}
              </>
            )}
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={() => setDetailsOpen(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
