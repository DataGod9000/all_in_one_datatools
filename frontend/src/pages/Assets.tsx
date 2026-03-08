import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, getApi } from '../api';
import { useToast } from '../context/ToastContext';
import { AppSelect } from '../components/AppSelect';
import type { TableRow } from '../types';

function tableId(t: TableRow) {
  if (t.type === 'pending_request' && t.request_id != null) return `pending-${t.request_id}`;
  return `${t.env_schema || ''}.${t.table_name || ''}`;
}

function fmtDate(s: string | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return '—';
  }
}

export default function Assets() {
  const navigate = useNavigate();
  const toast = useToast();
  const [env, setEnv] = useState('');
  const [filter, setFilter] = useState<'tables' | 'backups' | 'to_be_deleted'>('tables');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<{ table: TableRow; triggerRef: HTMLElement } | null>(null);

  const [detailsOpen, setDetailsOpen] = useState<TableRow | null>(null);
  const [detailsData, setDetailsData] = useState<any>(null);

  const [deleteOpen, setDeleteOpen] = useState<TableRow | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const loadAssets = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams();
    if (env) params.set('env_schema', env);
    params.set('filter', filter);
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    const tablesUrl = '/assets/tables' + (params.toString() ? '?' + params.toString() : '');
    const needsPending = filter === 'tables' || filter === 'to_be_deleted' || filter === 'backups';
    Promise.all([
      getApi(tablesUrl),
      needsPending ? getApi('/api/table-requests?status=pending_approval') : Promise.resolve({ ok: false, json: {} }),
    ])
      .then(([tablesRes, pendingRes]) => {
        setLoading(false);
        if (!tablesRes.ok) {
          setLoadError(tablesRes.json?.detail || 'Failed to load tables');
          setTables([]);
          return;
        }
        let list: TableRow[] = Array.isArray(tablesRes.json?.tables) ? tablesRes.json.tables : [];
        if (needsPending && pendingRes.ok && Array.isArray(pendingRes.json?.requests)) {
          const requests = pendingRes.json.requests as { id: number; table_name: string; environment: string; submitted_at: string | null; action?: string }[];
          const actionFilter =
            filter === 'tables' ? 'create' : filter === 'to_be_deleted' ? 'delete' : 'restore';
          const pending: TableRow[] = requests
            .filter((r) => (r.action || 'create') === actionFilter)
            .map((r) => ({
              env_schema: (r.environment || 'prod').toLowerCase(),
              table_name: r.table_name,
              type: 'pending_request' as const,
              status: 'Pending',
              created_at: r.submitted_at || undefined,
              request_id: r.id,
            }));
          list = [...pending, ...list];
          const earliestFirst = filter === 'backups';
          list.sort((a, b) => {
            const aAt = a.created_at || '';
            const bAt = b.created_at || '';
            return earliestFirst ? aAt.localeCompare(bAt) : bAt.localeCompare(aAt);
          });
        }
        setTables(list);
      })
      .catch((err) => {
        setLoading(false);
        setLoadError(err?.message || 'Network error. Is the backend running on port 8000?');
        setTables([]);
      });
  }, [env, filter, debouncedSearch]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (detailsOpen) {
      getApi(`/assets/table-details?env_schema=${encodeURIComponent(detailsOpen.env_schema)}&table_name=${encodeURIComponent(detailsOpen.table_name)}`)
        .then((res) => setDetailsData(res.ok ? res.json : null))
        .catch(() => setDetailsData(null));
    } else {
      setDetailsData(null);
    }
  }, [detailsOpen]);

  const openMenuId = openMenu ? tableId(openMenu.table) : null;

  const openMenuFor = (table: TableRow, e: React.MouseEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    setOpenMenu((prev) => (prev && tableId(prev.table) === tableId(table) ? null : { table, triggerRef: el }));
  };

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenu]);

  const handleShowDetails = (t: TableRow) => {
    setOpenMenu(null);
    setDetailsOpen(t);
  };

  const handleGenerateSelect = async (t: TableRow) => {
    setOpenMenu(null);
    const res = await getApi(`/assets/table-columns?env_schema=${encodeURIComponent(t.env_schema)}&table_name=${encodeURIComponent(t.table_name)}`);
    if (!res.ok) {
      toast(res.json?.detail || 'Failed to get columns', 'error');
      return;
    }
    const cols = res.json?.columns || [];
    const quoted = cols.map((c: string) => '  "' + String(c).replace(/"/g, '""') + '"');
    const sql = 'SELECT\n' + quoted.join(',\n') + '\nFROM "' + t.env_schema + '"."' + t.table_name.replace(/"/g, '""') + '"';
    navigator.clipboard.writeText(sql).then(() => toast('SELECT statement copied to clipboard', 'success')).catch(() => toast('Could not copy', 'error'));
  };

  const handleGenerateDdl = async (t: TableRow) => {
    setOpenMenu(null);
    const res = await getApi(`/assets/table-ddl?env_schema=${encodeURIComponent(t.env_schema)}&table_name=${encodeURIComponent(t.table_name)}`);
    if (!res.ok) {
      toast(res.json?.detail || 'Failed to get DDL', 'error');
      return;
    }
    const ddl = res.json?.ddl || '';
    navigator.clipboard.writeText(ddl).then(() => toast('DDL copied to clipboard.', 'success')).catch(() => toast('Could not copy', 'error'));
  };

  const handleDeleteClick = (t: TableRow) => {
    setOpenMenu(null);
    setDeleteOpen(t);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteOpen) return;
    const t = deleteOpen;
    setDeleteOpen(null);
    const isProd = t.env_schema?.toLowerCase() === 'prod';
    if (isProd) {
      const res = await api('/api/table-requests', {
        table_name: t.table_name,
        sql_statement: '',
        environment: 'PROD',
        submitted_by: 'Joseph The Data Engineer',
        action: 'delete',
      });
      if (res.ok) {
        loadAssets();
        window.dispatchEvent(new Event('approval-updated'));
        toast('PROD delete request submitted for approval.', 'success');
      } else {
        toast(res.json?.detail || 'Failed to submit delete request', 'error');
      }
      return;
    }
    const res = await api('/assets/schedule-delete', { env_schema: t.env_schema, table_name: t.table_name });
    if (res.ok) {
      loadAssets();
      toast('Table scheduled for deletion. Backup created.', 'success');
    } else {
      toast(res.json?.detail || 'Failed to schedule delete', 'error');
    }
  };

  const handleRestore = async (t: TableRow) => {
    setOpenMenu(null);
    const isProd = t.env_schema?.toLowerCase() === 'prod';
    if (isProd) {
      const res = await api('/api/table-requests', {
        table_name: t.table_name,
        sql_statement: '',
        environment: 'PROD',
        submitted_by: 'Joseph The Data Engineer',
        action: 'restore',
      });
      if (res.ok) {
        loadAssets();
        window.dispatchEvent(new Event('approval-updated'));
        toast('PROD restore request submitted for approval.', 'success');
      } else {
        toast(res.json?.detail || 'Failed to submit restore request', 'error');
      }
      return;
    }
    const res = await api('/assets/restore-backup', { env_schema: t.env_schema, table_name: t.table_name });
    if (res.ok) {
      loadAssets();
      toast('Table restored. It will appear in Tables.', 'success');
    } else {
      toast(res.json?.detail || 'Failed to restore', 'error');
    }
  };

  return (
    <section id="view-assets" className="section view">
      <h2>Assets</h2>
      <p className="subtitle">Tables created via this app. Filter by environment, search by name, or view backups and to-be-deleted tables.</p>
      <div className="card">
        <div className="assets-toolbar">
          <div className="assets-toolbar-controls">
            <div className="assets-toolbar-row">
              <AppSelect
                className="assets-env-select"
                value={env}
                onChange={setEnv}
                options={[
                  { value: 'dev', label: 'dev' },
                  { value: 'prod', label: 'prod' },
                ]}
                placeholder="All environments"
                aria-label="Filter by environment"
              />
              <input
                type="text"
                className="assets-search"
                placeholder="Search tables…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button type="button" className="primary btn-create-table" onClick={() => navigate('/create-table')}>
                Create table
              </button>
            </div>
          </div>
          <div className="assets-filter-tabs" role="tablist">
            {(['tables', 'backups', 'to_be_deleted'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`filter-tab ${filter === f ? 'active' : ''}`}
                data-filter={f}
                onClick={() => setFilter(f)}
              >
                {f === 'tables' ? 'Tables' : f === 'backups' ? 'Backups' : 'To be deleted'}
              </button>
            ))}
          </div>
        </div>
        <div className="assets-list">
          {loading && <p className="text-muted">Loading…</p>}
          {loadError && (
            <div className="result-box error">
              {loadError}
              <br />
              <small>Ensure the backend is running: <code>uvicorn main:app --reload --port 8000</code></small>
            </div>
          )}
          {!loading && !loadError && tables.length === 0 && (
            <p className="text-muted">No tables match. Click &quot;Create table&quot; to add one (Tables view).</p>
          )}
          {!loading && tables.length > 0 && (
            <div className="assets-table-wrap">
              <table className="assets-table">
                <thead>
                  <tr>
                    <th>Schema</th>
                    <th>Table name</th>
                    <th>Owner</th>
                    <th>Status</th>
                    <th>Create time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map((t) => {
                    const status = t.type === 'pending_request' ? 'Pending' : t.type === 'backup' ? 'Backup' : t.type === 'to_be_deleted' ? (t.delete_after ? `Delete ${t.delete_after}` : 'To delete') : (t.status || 'Active');
                    const rowKey = t.type === 'pending_request' && t.request_id != null ? `pending-${t.request_id}` : t.env_schema + '.' + t.table_name;
                    return (
                      <tr key={rowKey}>
                        <td>{t.env_schema || ''}</td>
                        <td><span className="table-name">{t.table_name || ''}</span></td>
                        <td>{t.type === 'pending_request' ? '—' : (t.owner || '—')}</td>
                        <td>{status}</td>
                        <td>{fmtDate(t.created_at)}</td>
                        <td>
                          <div className="assets-actions">
                            <button type="button" className="menu-trigger" onClick={(e) => openMenuFor(t, e)} aria-label="Actions">⋯</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Action menu dropdown - rendered in portal to avoid DOM/stacking issues */}
      {openMenu && openMenuId && openMenu.triggerRef && createPortal(
        <div className="assets-actions" onClick={(e) => e.stopPropagation()}>
          <div
            ref={menuRef}
            className="menu-dropdown visible"
            style={{
              position: 'fixed',
              top: openMenu.triggerRef.getBoundingClientRect().bottom + 4,
              right: window.innerWidth - openMenu.triggerRef.getBoundingClientRect().right,
            }}
          >
          {openMenu.table.type === 'pending_request' && (
            <button type="button" className="show-details" onClick={() => { setOpenMenu(null); navigate('/approval-center'); }}>Go to Approval Center</button>
          )}
          {openMenu.table.type === 'table' && (
            <>
              <button type="button" className="show-details" onClick={() => handleShowDetails(openMenu.table)}>Show details</button>
              <button type="button" className="generate-select" onClick={() => handleGenerateSelect(openMenu.table)}>Generate SELECT</button>
              <button type="button" className="generate-ddl" onClick={() => handleGenerateDdl(openMenu.table)}>Generate DDL</button>
              <button type="button" className="delete" onClick={() => handleDeleteClick(openMenu.table)}>Delete</button>
            </>
          )}
          {openMenu.table.type === 'backup' && (
            <button type="button" className="restore" onClick={() => handleRestore(openMenu.table)}>Restore table</button>
          )}
          </div>
        </div>,
        document.body
      )}

      {/* Details modal */}
      {detailsOpen && (
        <div className="modal-overlay visible" onClick={() => setDetailsOpen(null)}>
          <div className="modal-card modal-details" onClick={(e) => e.stopPropagation()}>
            <h3>{detailsOpen.env_schema}.{detailsOpen.table_name}</h3>
            {detailsData ? (
              <>
                <div className="details-stats">
                  <div className="details-row"><span className="details-label">Environment</span><span>{detailsData.env_schema || ''}</span></div>
                  <div className="details-row"><span className="details-label">Owner</span><span>{detailsData.owner || '—'}</span></div>
                  <div className="details-row"><span className="details-label">Rows</span><span>{detailsData.row_count != null ? Number(detailsData.row_count).toLocaleString() : '—'}</span></div>
                  <div className="details-row"><span className="details-label">Size</span><span>{detailsData.size_human || '—'}</span></div>
                </div>
                <h4 className="details-sample-title">Sample data</h4>
                {detailsData.sample_columns?.length > 0 && detailsData.sample_rows?.length > 0 ? (
                  <div className="details-sample-wrap">
                    <table className="query-results-table">
                      <thead>
                        <tr>{detailsData.sample_columns.map((c: string) => <th key={c}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {detailsData.sample_rows.map((row: any[], i: number) => (
                          <tr key={i}>{row.map((v, j) => <td key={j}>{v == null ? 'NULL' : String(v)}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="query-results-meta">No rows.</p>
                )}
              </>
            ) : (
              <p className="query-results-loading">Loading…</p>
            )}
            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={() => setDetailsOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteOpen && (
        <div className="modal-overlay visible" onClick={() => setDeleteOpen(null)}>
          <div className="modal-card modal-delete" onClick={(e) => e.stopPropagation()}>
            <h3>Schedule deletion</h3>
            <p className="modal-summary" id="assets-delete-modal-table">{deleteOpen.env_schema}.{deleteOpen.table_name}</p>
            <p className="modal-steps">
              A backup <code>back_up_{deleteOpen.table_name}_{new Date().toISOString().slice(0, 10).replace(/-/g, '')}</code> will be created. The table will be renamed to <code>to_be_deleted_{deleteOpen.table_name}</code> and dropped in 7 days.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-btn secondary" onClick={() => setDeleteOpen(null)}>Cancel</button>
              <button type="button" className="modal-btn primary" onClick={handleDeleteConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
