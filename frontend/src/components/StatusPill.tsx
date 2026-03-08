import type { ReactNode } from 'react';

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'status-pill-pending',
  pending_governance: 'status-pill-pending',
  approved: 'status-pill-approved',
  rejected: 'status-pill-rejected',
  submitted: 'status-pill-submitted',
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'Pending Approval',
  pending_governance: 'Pending Governance',
  approved: 'Approved',
  rejected: 'Rejected',
  submitted: 'Submitted',
};

interface StatusPillProps {
  status: string;
  label?: string;
  children?: ReactNode;
}

export function StatusPill({ status, label, children }: StatusPillProps) {
  const className = STATUS_STYLE[status] ?? 'status-pill-default';
  const text = children ?? label ?? STATUS_LABEL[status] ?? status;
  return <span className={`status-pill ${className}`}>{text}</span>;
}
