import { useState, useEffect } from 'react';
import { getApi } from '../api';
import { StatusPill } from '../components/StatusPill';
import type { TableRequest } from '../types';

export default function RequestHistory() {
  const [requests, setRequests] = useState<TableRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await getApi('/api/table-requests');
      setLoading(false);
      if (res.ok && Array.isArray(res.json?.requests)) {
        setRequests(res.json.requests);
      }
    })();
  }, []);

  return (
    <section id="view-requests-history" className="section view">
      <h2>Request History</h2>
      <p className="subtitle">
        All table creation requests (any environment and status).
      </p>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="card overflow-x">
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Table name</th>
                <th>Environment</th>
                <th>Status</th>
                <th>Submitted by</th>
                <th>Submitted at</th>
                <th>Approved at</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>#{req.id}</td>
                  <td><code>{req.table_name}</code></td>
                  <td>{req.environment}</td>
                  <td><StatusPill status={req.status} /></td>
                  <td>{req.submitted_by}</td>
                  <td>{req.submitted_at ? formatDateTime(req.submitted_at) : '—'}</td>
                  <td>{req.approved_at ? formatDateTime(req.approved_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {requests.length === 0 && (
            <p className="muted table-empty">No requests yet.</p>
          )}
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
