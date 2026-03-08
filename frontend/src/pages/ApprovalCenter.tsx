import { useState, useEffect } from 'react';
import { getApi, patchApi } from '../api';
import { useToast } from '../context/ToastContext';
import { ApprovalTimeline } from '../components/ApprovalTimeline';
import type { TableRequest } from '../types';

const TEAM_LEAD_NAME = 'Joseph The Team Lead';
const GOVERNANCE_NAME = 'Joseph The Data Governance Guy';

export default function ApprovalCenter() {
  const toast = useToast();
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await getApi('/api/table-requests?status=pending_approval');
    setLoading(false);
    if (res.ok && Array.isArray(res.json?.requests)) {
      setRequests(res.json.requests);
    } else {
      setRequests([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApproveTeamLead = async (id: number) => {
    setActioningId(id);
    const res = await patchApi(`/api/table-requests/${id}/approve`, { approved_by: TEAM_LEAD_NAME, step: 'team_lead' });
    setActioningId(null);
    if (res.ok) {
      toast('Team Lead approved. Waiting for Data Governance.', 'success');
      window.dispatchEvent(new Event('approval-updated'));
      load();
    } else {
      toast(res.json?.detail || 'Approve failed', 'error');
    }
  };

  const handleApproveGovernance = async (id: number) => {
    setActioningId(id);
    const res = await patchApi(`/api/table-requests/${id}/approve`, { approved_by: GOVERNANCE_NAME, step: 'governance' });
    setActioningId(null);
    if (res.ok) {
      toast('Table created in PROD after approval.', 'success');
      window.dispatchEvent(new Event('approval-updated'));
      load();
    } else {
      toast(res.json?.detail || 'Approve failed', 'error');
    }
  };

  const handleReject = async (id: number, reason?: string) => {
    setActioningId(id);
    const res = await patchApi(`/api/table-requests/${id}/reject`, { rejection_reason: reason || undefined });
    setActioningId(null);
    if (res.ok) {
      toast('Request rejected.', 'success');
      window.dispatchEvent(new Event('approval-updated'));
      load();
    } else {
      toast(res.json?.detail || 'Reject failed', 'error');
    }
  };

  return (
    <section id="view-approval-center" className="section view">
      <h2>Approval Center</h2>
      <p className="subtitle">
        Pending PROD table creation requests. Approve or reject as Team Lead.
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : requests.length === 0 ? (
        <div className="card">
          <p className="muted">No pending approval requests.</p>
        </div>
      ) : (
        <div className="approval-request-cards">
          {requests.map((req) => (
            <div key={req.id} className="card approval-request-card">
              <div className="approval-request-card-header">
                <span className="approval-request-id">
                  {req.action === 'delete' && 'Delete table'}
                  {req.action === 'restore' && 'Restore table'}
                  {(!req.action || req.action === 'create') && 'Create table'}
                  {' — Request #'}{req.id}
                </span>
                <span className="approval-request-env">{req.environment}</span>
              </div>
              <div className="approval-request-card-body">
                <div className="approval-request-meta">
                  <div><strong>{req.action === 'restore' ? 'Backup table' : 'Table'}</strong> {req.table_name}</div>
                  <div><strong>Submitted by</strong> {req.submitted_by}</div>
                  <div><strong>Submitted at</strong> {req.submitted_at ? formatDateTime(req.submitted_at) : '—'}</div>
                </div>
                {req.sql_statement && (req.action === 'create' || !req.action) && (
                  <details className="approval-request-sql">
                    <summary>SQL statement</summary>
                    <pre>{req.sql_statement}</pre>
                  </details>
                )}
                <ApprovalTimeline request={req} />
              </div>
              <div className="approval-request-card-actions">
                {req.status === 'pending_approval' && (
                  <button
                    type="button"
                    className="primary approval-approve-btn"
                    disabled={actioningId === req.id}
                    onClick={() => handleApproveTeamLead(req.id)}
                  >
                    {actioningId === req.id ? 'Approving…' : 'Approve (Team Lead)'}
                  </button>
                )}
                {req.status === 'pending_governance' && (
                  <button
                    type="button"
                    className="primary approval-approve-btn"
                    disabled={actioningId === req.id}
                    onClick={() => handleApproveGovernance(req.id)}
                  >
                    {actioningId === req.id ? 'Approving…' : 'Approve (Governance)'}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary approval-reject-btn"
                  disabled={actioningId === req.id}
                  onClick={() => handleReject(req.id)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
