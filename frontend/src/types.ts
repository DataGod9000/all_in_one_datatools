export interface TableRow {
  env_schema: string;
  table_name: string;
  type: 'table' | 'backup' | 'to_be_deleted';
  status?: string;
  created_at?: string;
  owner?: string;
  delete_after?: string;
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
