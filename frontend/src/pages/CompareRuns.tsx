import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApi } from '../api';

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
      return <span className="status-badge status-completed">Completed</span>;
    case 'error':
      return <span className="status-badge status-error">Error</span>;
    default:
      return <span className="status-badge status-pending">{status}</span>;
  }
}

export default function CompareRuns() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<CompareRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState('');
  const [detailsOpen, setDetailsOpen] = useState<CompareRun | null>(null);

  const loadRuns = useCallback(() => {
    setLoading(true);
    const params = envFilter ? `?env_schema=${encodeURIComponent(envFilter)}` : '';
    getApi('/compare/runs' + params)
      .then((res) => {
        setLoading(false);
        setRuns((res.ok && res.json?.runs) ? res.json.runs : []);
      })
      .catch(() => {
        setLoading(false);
        setRuns([]);
      });
  }, [envFilter]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns]);

  return (
    <section id="view-compare-runs" className="section view">
      <h2>Comparison runs</h2>
      <p className="subtitle">Submitted table comparisons. View status and results.</p>
      <div className="card">
        <div className="assets-toolbar">
          <div className="assets-toolbar-controls">
            <div className="assets-toolbar-row">
              <select
                className="assets-env-select"
                value={envFilter}
                onChange={(e) => setEnvFilter(e.target.value)}
                aria-label="Filter by environment"
              >
                <option value="">All environments</option>
                <option value="dev">dev</option>
                <option value="prod">prod</option>
              </select>
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
            <h3>Compare: {detailsOpen.left_env_schema ?? detailsOpen.env_schema}.{detailsOpen.left_table} (PT {detailsOpen.left_pt ?? '—'}) vs {detailsOpen.right_env_schema ?? detailsOpen.env_schema}.{detailsOpen.right_table} (PT {detailsOpen.right_pt ?? '—'})</h3>
            <div className="details-stats">
              <div className="details-row">
                <span className="details-label">Status</span>
                <span>{statusBadge(detailsOpen.status)}</span>
              </div>
              <div className="details-row">
                <span className="details-label">Join keys</span>
                <span>{(detailsOpen.join_keys || []).join(', ') || '—'}</span>
              </div>
              <div className="details-row">
                <span className="details-label">Compare columns</span>
                <span>{(detailsOpen.compare_columns || []).join(', ') || '—'}</span>
              </div>
            </div>
            {detailsOpen.status === 'error' && detailsOpen.error_message && (
              <div className="result-box error">
                <p>{detailsOpen.error_message}</p>
              </div>
            )}
            {detailsOpen.status === 'completed' && detailsOpen.result_json && (
              <>
                <h4 className="details-sample-title">Results</h4>
                <div className="details-stats">
                  <div className="details-row">
                    <span className="details-label">Left count</span>
                    <span>{Number(detailsOpen.result_json.left_count ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-label">Right count</span>
                    <span>{Number(detailsOpen.result_json.right_count ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-label">Missing in right</span>
                    <span>{Number(detailsOpen.result_json.missing_in_right ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="details-row">
                    <span className="details-label">Missing in left</span>
                    <span>{Number(detailsOpen.result_json.missing_in_left ?? 0).toLocaleString()}</span>
                  </div>
                </div>
                {detailsOpen.result_json.sample && detailsOpen.result_json.sample.length > 0 && (
                  <>
                    <h4 className="details-sample-title">Sample differences</h4>
                    <div className="details-sample-wrap">
                      <pre className="result-box">
                        {JSON.stringify(detailsOpen.result_json.sample, null, 2)}
                      </pre>
                    </div>
                  </>
                )}
              </>
            )}
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
