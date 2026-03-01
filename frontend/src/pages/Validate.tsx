import { useState, useEffect, useCallback } from 'react';
import { AppSelect } from '../components/AppSelect';
import { useNavigate } from 'react-router-dom';
import { getApi } from '../api';
import type { TableRow } from '../types';

export default function Validate() {
  const navigate = useNavigate();
  const [schema, setSchema] = useState('dev');
  const [tables, setTables] = useState<TableRow[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<TableRow | null>(null);

  const loadTables = useCallback(() => {
    setTablesLoading(true);
    const params = new URLSearchParams({ filter: 'tables', env_schema: schema });
    getApi('/assets/tables?' + params.toString())
      .then((res) => {
        setTablesLoading(false);
        const list = (res.ok && res.json?.tables) ? res.json.tables : [];
        setTables(list);
        setSelectedTable((prev) => {
          if (!prev) return list[0] ?? null;
          const found = list.find((t) => t.table_name === prev.table_name);
          return found ?? list[0] ?? null;
        });
      })
      .catch(() => {
        setTablesLoading(false);
        setTables([]);
        setSelectedTable(null);
      });
  }, [schema]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const handleValidate = () => {
    const table = selectedTable?.table_name?.trim();
    if (!table) return;
    const payload = { target_table: table, env_schema: schema };
    navigate('/validate/runs', { state: { submitPayload: payload } });
  };

  return (
    <section id="view-validate" className="section view">
      <h2>Validate</h2>
      <p className="subtitle">Run data quality checks on a table: null counts per column and duplicate rows.</p>
      <div className="card">
        <div className="validate-form">
          <div className="panels-grid">
            <div className="panel">
              <p className="panel-title">Run validation</p>
              <p className="card-desc">Select environment and table, then run. Results appear on the Validation runs page.</p>
              <div className="compare-row">
                <label>Environment schema</label>
                <AppSelect
                  value={schema}
                  onChange={setSchema}
                  options={[
                    { value: 'dev', label: 'dev' },
                    { value: 'prod', label: 'prod' },
                  ]}
                />
              </div>
              <div className="compare-row">
                <label>Target table</label>
                <AppSelect
                  value={selectedTable ? `${selectedTable.env_schema}.${selectedTable.table_name}` : ''}
                  onChange={(v) => {
                    const t = tables.find((x) => `${x.env_schema}.${x.table_name}` === v);
                    setSelectedTable(t ?? null);
                  }}
                  options={tables.map((t) => ({
                    value: `${t.env_schema}.${t.table_name}`,
                    label: t.table_name,
                  }))}
                  placeholder={tablesLoading ? 'Loading…' : 'Select a table'}
                  disabled={tablesLoading}
                  aria-label="Select table"
                />
              </div>
              <div className="compare-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={handleValidate}
                  disabled={!selectedTable || tablesLoading}
                >
                  Run validate
                </button>
              </div>
            </div>
            <div className="panel-divider" aria-hidden="true" />
            <div className="panel validate-info">
              <p className="panel-title">What we check</p>
              <div className="validate-checks">
                <div className="validate-check-card">
                  <span className="validate-check-icon" aria-hidden>#</span>
                  <div>
                    <strong>Total rows</strong>
                    <p>Row count of the table</p>
                  </div>
                </div>
                <div className="validate-check-card">
                  <span className="validate-check-icon" aria-hidden>∅</span>
                  <div>
                    <strong>Null counts</strong>
                    <p>Per-column null counts for every column</p>
                  </div>
                </div>
                <div className="validate-check-card">
                  <span className="validate-check-icon" aria-hidden>≡</span>
                  <div>
                    <strong>Duplicate rows</strong>
                    <p>Full row duplicates (identical values across all columns)</p>
                  </div>
                </div>
              </div>
              <div className="validate-info-footer">
                <p>Tables exclude backups and scheduled deletions. Results are stored and viewable on the Validation runs page.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
