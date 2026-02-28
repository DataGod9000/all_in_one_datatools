import { useState } from 'react';
import { api } from '../api';

export default function Validate() {
  const [table, setTable] = useState('users');
  const [schema, setSchema] = useState('dev');
  const [keys, setKeys] = useState('id');
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const handleValidate = async () => {
    const keysStr = keys.trim();
    const res = await api('/validate/run', {
      target_table: table.trim(),
      env_schema: schema,
      key_columns: keysStr ? keysStr.split(',').map((s) => s.trim()).filter(Boolean) : null,
    });
    const text = typeof (res.ok ? res.json : res.json?.detail ?? res.json) === 'string'
      ? (res.ok ? res.json : res.json?.detail ?? res.json)
      : JSON.stringify(res.ok ? res.json : res.json?.detail ?? res.json, null, 2);
    setResult({ text, error: !res.ok });
  };

  return (
    <section id="view-validate" className="section view">
      <h2>Validate</h2>
      <p className="subtitle">Run data quality checks on a table: total rows, null counts per column, and duplicate key groups.</p>
      <div className="panels-grid panels-grid-single">
        <div className="panel">
          <p className="panel-title">Run validation</p>
          <p className="card-desc">Checks row count, null counts per column, and duplicate key groups. Results are written to the audit log.</p>
          <label>Target table</label>
          <input type="text" value={table} onChange={(e) => setTable(e.target.value)} placeholder="users" />
          <label>Environment schema</label>
          <select value={schema} onChange={(e) => setSchema(e.target.value)}>
            <option value="dev">dev</option>
            <option value="prod">prod</option>
          </select>
          <label>Key columns (comma-separated, optional)</label>
          <input type="text" value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="id" />
          <button type="button" className="primary" onClick={handleValidate}>Run validate</button>
          {result && (
            <div className={`result-box ${result.error ? 'error' : 'success'}`}>{result.text}</div>
          )}
        </div>
      </div>
    </section>
  );
}
