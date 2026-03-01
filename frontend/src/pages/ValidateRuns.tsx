import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getApi, api } from '../api';
import { useToast } from '../context/ToastContext';
import { AppSelect } from '../components/AppSelect';

interface ValidateRun {
  id: number;
  target_table: string;
  env_schema: string;
  result_json: {
    total_rows?: number;
    null_counts?: { column: string; null_count: number }[];
    duplicate_rows?: number;
  } | null;
  status: 'completed' | 'error' | 'pending';
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
      return <span className="status-badge status-pending">Validating…</span>;
    default:
      return <span className="status-badge status-pending">{status}</span>;
  }
}

export default function ValidateRuns() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [runs, setRuns] = useState<ValidateRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState('');
  const [detailsOpen, setDetailsOpen] = useState<ValidateRun | null>(null);
  const watchedRunIdRef = useRef<number | null>(null);

  const loadRuns = useCallback((showLoading = true) => {
    if (showLoading) setLoading(true);
    const params = envFilter ? `?env_schema=${encodeURIComponent(envFilter)}` : '';
    getApi('/validate/runs' + params)
      .then((res) => {
        setLoading(false);
        const newRuns = (res.ok && res.json?.runs) ? res.json.runs : [];
        setRuns(newRuns);

        const watchedId = watchedRunIdRef.current;
        if (watchedId) {
          const run = newRuns.find((r) => r.id === watchedId);
          if (run && run.status === 'completed') {
            toast('Validation completed. Click Details to view results.', 'success');
            watchedRunIdRef.current = null;
          } else if (run && run.status === 'error') {
            toast('Validation failed. Click Details for error.', 'error');
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

  const { submitPayload } = (location.state || {}) as { submitPayload?: Record<string, unknown> };
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!submitPayload || submittedRef.current) return;
    submittedRef.current = true;
    navigate(location.pathname, { replace: true, state: {} });
    api('/validate/run', submitPayload)
      .then((res) => {
        if (res.ok && res.json?.run_id != null) {
          toast('Validation started. You will be notified when it completes.', 'success');
          watchedRunIdRef.current = res.json.run_id;
          loadRuns(false);
        } else {
          const detail = res.json?.detail;
          let msg = 'Failed to start validation';
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
        toast(err instanceof Error ? err.message : 'Network error. Is the backend running?', 'error');
      });
  }, [submitPayload, location.pathname, navigate, toast, loadRuns]);

  const hasPending = runs.some((r) => r.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => loadRuns(false), 2000);
    return () => clearInterval(id);
  }, [hasPending, loadRuns]);

  return (
    <section id="view-validate-runs" className="section view">
      <h2>Validation runs</h2>
      <p className="subtitle">Submitted validations. View status and results.</p>
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
              <button type="button" className="primary" onClick={() => navigate('/validate')}>
                New validation
              </button>
            </div>
          </div>
        </div>
        <div className="assets-list">
          {loading && <p className="text-muted">Loading…</p>}
          {!loading && runs.length === 0 && (
            <p className="text-muted">No validation runs yet. Go to Validate to submit one.</p>
          )}
          {!loading && runs.length > 0 && (
            <div className="assets-table-wrap">
              <table className="assets-table">
                <thead>
                  <tr>
                    <th>Target table</th>
                    <th>Environment</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td><span className="table-name">{r.target_table}</span></td>
                      <td>{r.env_schema ?? 'dev'}</td>
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
            <h3>Validate: {detailsOpen.env_schema}.{detailsOpen.target_table}</h3>
            <div className="details-stats">
              <div className="details-row">
                <span className="details-label">Status</span>
                <span>{statusBadge(detailsOpen.status)}</span>
              </div>
            </div>
            <div className="modal-details-body">
            {detailsOpen.status === 'pending' && (
              <p className="text-muted">Validation in progress… Results will appear when complete.</p>
            )}
            {detailsOpen.status === 'error' && detailsOpen.error_message && (
              <div className="result-box error">
                <p>{detailsOpen.error_message}</p>
              </div>
            )}
            {detailsOpen.status === 'completed' && detailsOpen.result_json && (
              <>
                <div className="validate-result-summary">
                  <div className="validate-result-card">
                    <span className="validate-result-card-label">Total rows</span>
                    <span className="validate-result-card-value">{Number(detailsOpen.result_json.total_rows ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="validate-result-card">
                    <span className="validate-result-card-label">Duplicate rows</span>
                    <span className="validate-result-card-value">{Number(detailsOpen.result_json.duplicate_rows ?? 0).toLocaleString()}</span>
                  </div>
                </div>
                {detailsOpen.result_json.null_counts && detailsOpen.result_json.null_counts.length > 0 && (
                  <>
                    <h4 className="details-sample-title">Null counts per column</h4>
                    <div className="validate-null-grid">
                      {detailsOpen.result_json.null_counts.map((nc, i) => (
                        <div key={i} className="validate-null-item">
                          <span className="validate-null-col">{nc.column}</span>
                          <span className={`validate-null-val ${Number(nc.null_count ?? 0) > 0 ? 'has-nulls' : ''}`}>
                            {Number(nc.null_count ?? 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
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
