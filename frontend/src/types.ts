export interface TableRow {
  env_schema: string;
  table_name: string;
  type: 'table' | 'backup' | 'to_be_deleted' | 'pending_request';
  status?: string;
  created_at?: string;
  owner?: string;
  delete_after?: string;
  /** Set for type === 'pending_request' */
  request_id?: number;
}

export interface ParsedDdl {
  schema_in_ddl?: string;
  table: string;
  columns: { name: string; type?: string; nullable?: boolean; default?: string }[];
  constraints?: { raw?: string }[];
}

export interface ColumnComment {
  column_name: string;
  comment_en: string;
  comment_zh: string;
}

export interface TableRequest {
  id: number;
  table_name: string;
  sql_statement: string;
  environment: string;
  status: string;
  submitted_by: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  approved_by_team_lead?: string | null;
  approved_at_team_lead?: string | null;
  action?: string;
}

export interface CreatedTable {
  id: number;
  table_name: string;
  sql_statement: string;
  environment: string;
  created_at: string | null;
  creation_source: string;
}
