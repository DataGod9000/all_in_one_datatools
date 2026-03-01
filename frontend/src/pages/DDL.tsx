import { useState, useCallback } from 'react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { TnSelect } from '../components/TnSelect';
import { AppSelect } from '../components/AppSelect';
import type { ParsedDdl, ColumnComment } from '../types';

const TABLE_NAME_GOVERNANCE = /^(ods|dws|dim|ads|dwd)_josephco_(trade|growth)_[a-zA-Z0-9_]+_(di|df|hi|hf)$/i;
const ALLOWED_TYPES = ['STRING', 'BIGINT', 'DECIMAL', 'TINYINT', 'DATETIME'];
const TYPE_TO_SQL: Record<string, string> = {
  STRING: 'TEXT',
  BIGINT: 'BIGINT',
  DECIMAL: 'DECIMAL(10,2)',
  TINYINT: 'SMALLINT',
  DATETIME: 'TIMESTAMP',
};

function getTypeOption(parsedType: string | undefined): string {
  if (!parsedType) return 'STRING';
  const u = (parsedType + '').toUpperCase();
  if (ALLOWED_TYPES.includes(parsedType)) return parsedType;
  if (u === 'BIGINT') return 'BIGINT';
  if (u === 'DECIMAL' || u.includes('DECIMAL') || u.includes('NUMERIC')) return 'DECIMAL';
  if (u === 'TINYINT' || u === 'SMALLINT' || u === 'INT2') return 'TINYINT';
  if (u.includes('TIMESTAMP') || u === 'DATE' || u === 'DATETIME') return 'DATETIME';
  return 'STRING';
}

function parseGovernanceName(name: string): { layer: string; domain: string; core: string; granularity: string } | null {
  const m = (name || '').match(/^(ods|dws|dim|ads|dwd)_josephco_(trade|growth)_(.+)_(di|df|hi|hf)$/i);
  if (!m) return null;
  return { layer: m[1].toLowerCase(), domain: m[2].toLowerCase(), core: m[3], granularity: m[4].toLowerCase() };
}

interface ColumnRow {
  index: number;
  name: string;
  type: string;
  commentEn: string;
  commentZh: string;
}

export default function DDL() {
  const toast = useToast();
  const [ddl, setDdl] = useState('');
  const [env, setEnv] = useState('dev');
  const [layer, setLayer] = useState('ods');
  const [domain, setDomain] = useState('growth');
  const [core, setCore] = useState('');
  const [granularity, setGranularity] = useState('di');
  const [parsed, setParsed] = useState<ParsedDdl | null>(null);
  const [columns, setColumns] = useState<ColumnRow[]>([]);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const assembledName = core.trim() ? `${layer}_josephco_${domain}_${core.trim().replace(/\s+/g, '_').toLowerCase()}_${granularity}` : null;

  const fillTableNameBuilder = useCallback((rawName: string) => {
    const parts = parseGovernanceName(rawName);
    if (parts) {
      setLayer(parts.layer);
      setDomain(parts.domain);
      setCore(parts.core);
      setGranularity(parts.granularity);
    } else {
      setCore(rawName || '');
    }
  }, []);

  const handleParse = async () => {
    setResult(null);
    if (!ddl.trim()) {
      setResult({ text: 'Paste a CREATE TABLE statement first.', error: true });
      return;
    }
    const res = await api('/ddl/parse', { ddl: ddl.trim() });
    if (!res.ok) {
      setResult({ text: res.json?.detail || res.json || 'Parse failed', error: true });
      setParsed(null);
      return;
    }
    const p = res.json as ParsedDdl;
    setParsed(p);
    fillTableNameBuilder(p.table || '');
    const cols = (p.columns || []).map((c, i) => ({
      index: i,
      name: c.name || '',
      type: getTypeOption(c.type),
      commentEn: '',
      commentZh: '',
    }));
    setColumns(cols);
    const tableName = (p.table || '').trim();
    if (!TABLE_NAME_GOVERNANCE.test(tableName)) {
      setResult({ text: 'Parsed. Set the table name parts above to match governance, then click Create table.', error: false });
    } else {
      setResult({ text: 'Parsed. Edit column types and name if needed, then click Create table.', error: false });
    }
  };

  const updateColumn = (index: number, updates: Partial<ColumnRow>) => {
    setColumns((prev) => prev.map((c) => (c.index === index ? { ...c, ...updates } : c)));
  };

  const handleSuggestName = async () => {
    if (!parsed) {
      setResult({ text: 'Parse the DDL first, then click Suggest name with AI.', error: true });
      return;
    }
    setResult({ text: 'Suggesting table name with AI…', error: false });
    const res = await api('/ddl/suggest-table-name', { ddl: ddl.trim() });
    if (!res.ok) {
      setResult({ text: res.json?.detail || res.json || 'AI suggestion failed', error: true });
      return;
    }
    fillTableNameBuilder(res.json.suggested_name || '');
    setResult(null);
    toast('Suggested: ' + res.json.suggested_name + '. Adjust any part if needed.', 'success');
  };

  const handleSuggestComments = async () => {
    if (!parsed) {
      setResult({ text: 'Parse the DDL first (Parse & edit columns).', error: true });
      return;
    }
    setResult({ text: 'Generating comments with AI…', error: false });
    const colsForApi = columns.map((c) => ({ name: c.name, type: c.type }));
    const res = await api('/ddl/suggest-column-comments', {
      columns: colsForApi,
      table_name: parsed.table || undefined,
    });
    if (!res.ok) {
      setResult({ text: res.json?.detail || res.json || 'AI suggestion failed', error: true });
      return;
    }
    const suggestions = res.json?.suggestions || [];
    setColumns((prev) =>
      prev.map((c) => {
        const s = suggestions.find((x: any) => x.column_name === c.name);
        return s ? { ...c, commentEn: s.comment_en || '', commentZh: s.comment_zh || '' } : c;
      })
    );
    setResult({ text: 'Comments filled. Review and edit if needed, then click Create table.', error: false });
  };

  const buildDdlFromColumns = (): string | null => {
    if (!parsed) return null;
    const tableName = assembledName || parsed.table;
    const colDefs = columns.map((c) => {
      const col = parsed.columns[c.index] || {};
      const typ = TYPE_TO_SQL[c.type] ?? c.type;
      const nullable = col.nullable !== false;
      let seg = `"${col.name}" ${typ}`;
      if (!nullable) seg += ' NOT NULL';
      return seg;
    });
    (parsed.constraints || []).forEach((c) => {
      if (c.raw) colDefs.push(c.raw);
    });
    return `CREATE TABLE "${env}"."${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`;
  };

  const collectColumnComments = (): ColumnComment[] =>
    columns.map((c) => ({
      column_name: c.name,
      comment_en: c.commentEn.trim(),
      comment_zh: c.commentZh.trim(),
    }));

  const handleCreate = async () => {
    if (!parsed) {
      setResult({ text: 'Parse the DDL first (Parse & edit columns).', error: true });
      return;
    }
    if (!assembledName) {
      setResult({ text: 'Fill in the Core table name in the Table Name builder above.', error: true });
      return;
    }
    if (!TABLE_NAME_GOVERNANCE.test(assembledName)) {
      setResult({ text: `Table name "${assembledName}" does not match governance. Check that the core name uses only letters, digits, and underscores.`, error: true });
      return;
    }
    const comments = collectColumnComments();
    const missing = comments.filter((cc) => !cc.comment_en || !cc.comment_zh);
    if (missing.length) {
      setResult({
        text: 'Data governance: every column must have both Comment (EN) and Comment (ZH). Missing for: ' + missing.map((c) => c.column_name).join(', ') + '. Use "Generate comments with AI" or fill manually.',
        error: true,
      });
      return;
    }
    const builtDdl = buildDdlFromColumns();
    if (!builtDdl) {
      setResult({ text: 'Could not build DDL from columns.', error: true });
      return;
    }
    setResult({ text: 'Creating table…', error: false });
    const res = await api('/ddl/apply', {
      ddl: builtDdl,
      env_schema: env,
      column_comments: comments,
    });
    const msg = res.ok ? res.json : res.json?.detail ?? res.json;
    setResult({
      text: typeof msg === 'object' ? JSON.stringify(msg, null, 2) : String(msg),
      error: !res.ok,
    });
  };

  const handleCoreChange = (v: string) => {
    setCore(v.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, ''));
  };

  return (
    <section id="view-create-table" className="section view">
      <h2>Create table</h2>
      <p className="subtitle">
        Paste your DDL, click <strong>Parse</strong>, then set the table name using the selectors below — or click <strong>Suggest name with AI</strong> to auto-fill. Add column comments in English &amp; Chinese, then <strong>Create table</strong>.
      </p>
      <div className="card">
        <div className="create-table-flow">
          <div className="step">
            <label>CREATE TABLE statement</label>
            <textarea
              className="ddl-input"
              value={ddl}
              onChange={(e) => setDdl(e.target.value)}
              placeholder={`CREATE TABLE kline_candles (
  open_time BIGINT NOT NULL,
  open NUMERIC(20,8) NOT NULL,
  high NUMERIC(20,8) NOT NULL,
  low NUMERIC(20,8) NOT NULL,
  close NUMERIC(20,8) NOT NULL
);`}
            />
          </div>
          <div className="row-inline">
            <div className="env-wrap">
              <label>Environment</label>
              <AppSelect
                value={env}
                onChange={setEnv}
                options={[
                  { value: 'dev', label: 'dev' },
                  { value: 'prod', label: 'prod' },
                ]}
              />
            </div>
            <button type="button" className="primary" onClick={handleParse}>Parse &amp; edit columns</button>
          </div>
          {parsed && columns.length > 0 && (
            <div id="columns-block" className="columns-block visible">
              <div className="table-name-builder">
                <div className="tn-header">
                  <span className="table-name-builder-label">Table Name</span>
                  <span className="tn-pattern-hint">layer · josephco · domain · core · granularity</span>
                </div>
                <div className="table-name-parts">
                  <div className="tn-segment tn-segment-select tn-segment-dropdown">
                    <TnSelect
                      id="tn-layer"
                      value={layer}
                      onChange={setLayer}
                      options={[
                        { value: 'ods', label: 'ODS · Source' },
                        { value: 'dws', label: 'DWS · Summary' },
                        { value: 'dim', label: 'DIM · Dimension' },
                        { value: 'ads', label: 'ADS · Output' },
                        { value: 'dwd', label: 'DWD · Detail' },
                      ]}
                    />
                  </div>
                  <span className="tn-connector">josephco</span>
                  <div className="tn-segment tn-segment-select tn-segment-dropdown">
                    <TnSelect
                      id="tn-domain"
                      value={domain}
                      onChange={setDomain}
                      options={[
                        { value: 'trade', label: 'trade' },
                        { value: 'growth', label: 'growth' },
                      ]}
                    />
                  </div>
                  <div className="tn-segment tn-segment-input">
                    <input type="text" id="tn-core" value={core} onChange={(e) => handleCoreChange(e.target.value)} placeholder="table_name" />
                  </div>
                  <div className="tn-segment tn-segment-select tn-segment-dropdown">
                    <TnSelect
                      id="tn-granularity"
                      value={granularity}
                      onChange={setGranularity}
                      options={[
                        { value: 'di', label: 'DI · Daily Inc.' },
                        { value: 'df', label: 'DF · Daily Full' },
                        { value: 'hi', label: 'HI · Hourly Inc.' },
                        { value: 'hf', label: 'HF · Hourly Full' },
                      ]}
                    />
                  </div>
                </div>
                <div className="table-name-preview">
                  <span className="tn-preview-label">Full name</span>
                  <code className="tn-preview-output">{assembledName || '—'}</code>
                </div>
              </div>
              <div className="columns-inner">
                <table className="cols-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th className="type-cell">Data type</th>
                      <th className="comment-cell">Comment (EN)</th>
                      <th className="comment-cell">Comment (ZH)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((c) => (
                      <tr key={c.index} data-index={c.index}>
                        <td className="col-name">{c.name}</td>
                        <td className="type-cell">
                          <AppSelect
                            value={c.type}
                            onChange={(v) => updateColumn(c.index, { type: v })}
                            options={ALLOWED_TYPES.map((t) => ({ value: t, label: t }))}
                          />
                        </td>
                        <td className="comment-cell">
                          <input
                            type="text"
                            value={c.commentEn}
                            onChange={(e) => updateColumn(c.index, { commentEn: e.target.value })}
                            placeholder="Required"
                          />
                        </td>
                        <td className="comment-cell">
                          <input
                            type="text"
                            value={c.commentZh}
                            onChange={(e) => updateColumn(c.index, { commentZh: e.target.value })}
                            placeholder="必填"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="comment-governance">Data governance: every column must have both English and Chinese comments.</p>
              <div className="row-inline btn-row">
                <button type="button" className="primary" onClick={handleSuggestName}>Suggest name with AI</button>
                <button type="button" className="primary" onClick={handleSuggestComments}>Generate comments with AI</button>
                <button type="button" className="primary btn-create-table" onClick={handleCreate}>Create table</button>
              </div>
            </div>
          )}
          {result && (
            <div id="result-create" className={`result-box ${result.error ? 'error' : 'success'}`}>
              {result.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
