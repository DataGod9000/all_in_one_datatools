import { StatusPill } from './StatusPill';
import type { TableRequest } from '../types';
import josephAvatar from '../assets/joseph-avatar.png';
import teamLeadAvatar from '../assets/team-lead-avatar.png';
import governanceAvatar from '../assets/governance-avatar.png';

const SUBMITTER_NAME = 'Joseph The Data Engineer';
const SUBMITTER_ROLE = 'Data Engineer';
const TEAM_LEAD_NAME = 'Joseph The Team Lead';
const TEAM_LEAD_ROLE = 'Team Lead';
const GOVERNANCE_NAME = 'Joseph The Data Governance Guy';
const GOVERNANCE_ROLE = 'Data Governance';

interface ApprovalTimelineProps {
  request: TableRequest;
}

export function ApprovalTimeline({ request }: ApprovalTimelineProps) {
  const teamLeadStatus =
    request.status === 'pending_approval'
      ? 'pending_approval'
      : request.status === 'rejected'
        ? 'rejected'
        : 'submitted'; // pending_governance or approved => Team Lead already passed
  const governanceStatus =
    request.status === 'approved'
      ? 'approved'
      : request.status === 'rejected'
        ? 'rejected'
        : 'pending_approval'; // pending_governance shows as Pending Approval for step 3

  return (
    <div className="approval-timeline">
      <div className="approval-timeline-track">
        <div className="approval-timeline-node">
          <div className="approval-timeline-node-dot" />
          <div className="approval-timeline-node-content">
            <div className="approval-timeline-step-header">
              <span className="approval-timeline-step-title">Submitter</span>
              <StatusPill status="submitted">Submitted</StatusPill>
            </div>
            <div className="approval-timeline-step-body">
              <img
                src={josephAvatar}
                alt=""
                className="approval-timeline-avatar approval-timeline-avatar-photo"
              />
              <div>
                <div className="approval-timeline-name">{SUBMITTER_NAME}</div>
                <div className="approval-timeline-meta">{SUBMITTER_ROLE}</div>
                {request.submitted_at && (
                  <div className="approval-timeline-time">{formatDateTime(request.submitted_at)}</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="approval-timeline-line" />
        <div className="approval-timeline-node">
          <div className="approval-timeline-node-dot" />
          <div className="approval-timeline-node-content">
            <div className="approval-timeline-step-header">
              <span className="approval-timeline-step-title">Team Lead Approval</span>
              <StatusPill status={teamLeadStatus} label={teamLeadStatus === 'submitted' ? 'Submitted' : undefined} />
            </div>
            <div className="approval-timeline-step-body">
              <img
                src={teamLeadAvatar}
                alt=""
                className="approval-timeline-avatar approval-timeline-avatar-photo"
              />
              <div>
                <div className="approval-timeline-name">{TEAM_LEAD_NAME}</div>
                <div className="approval-timeline-meta">{TEAM_LEAD_ROLE}</div>
                {request.approved_at_team_lead && (
                  <div className="approval-timeline-time">{formatDateTime(request.approved_at_team_lead)}</div>
                )}
                {request.status === 'pending_approval' && (
                  <div className="approval-timeline-meta">1 approver needs to pass it</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="approval-timeline-line" />
        <div className="approval-timeline-node">
          <div className="approval-timeline-node-dot" />
          <div className="approval-timeline-node-content">
            <div className="approval-timeline-step-header">
              <span className="approval-timeline-step-title">Data Governance Approval</span>
              <StatusPill status={governanceStatus} label={request.status === 'pending_governance' ? 'Pending Approval' : undefined} />
            </div>
            <div className="approval-timeline-step-body">
              <img
                src={governanceAvatar}
                alt=""
                className="approval-timeline-avatar approval-timeline-avatar-photo"
              />
              <div>
                <div className="approval-timeline-name">{GOVERNANCE_NAME}</div>
                <div className="approval-timeline-meta">{GOVERNANCE_ROLE}</div>
                {request.status === 'approved' && request.approved_at && (
                  <div className="approval-timeline-time">{formatDateTime(request.approved_at)}</div>
                )}
                {request.status === 'pending_governance' && (
                  <div className="approval-timeline-meta">1 approver needs to pass it</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
