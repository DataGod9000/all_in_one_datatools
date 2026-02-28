import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApi } from '../api';
import { useToast } from '../context/ToastContext';
import type { TableRow } from '../types';

interface ColumnPair {
  left: string;
  right: string;
}

export default function Compare() {
  const navigate = useNavigate();
  const toast = useToast();
  const [leftEnv, setLeftEnv] = useState('dev');
  const [rightEnv, setRightEnv] = useState('prod');
  const [leftTables, setLeftTables] = useState<TableRow[]>([]);
  const [rightTables, setRightTables] = useState<TableRow[]>([]);
  const [leftTablesLoading, setLeftTablesLoading] = useState(true);
  const [rightTablesLoading, setRightTablesLoading] = useState(true);

  const [leftTable, setLeftTable] = useState<TableRow | null>(null);
  const [rightTable, setRightTable] = useState<TableRow | null>(null);
  const [leftPt, setLeftPt] = useState('');
  const [rightPt, setRightPt] = useState('');

  const [leftColumns, setLeftColumns] = useState<string[]>([]);
  const [rightColumns, setRightColumns] = useState<string[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);

  const [joinKeyPairs, setJoinKeyPairs] = useState<ColumnPair[]>([]);
  const [compareColumnPairs, setCompareColumnPairs] = useState<ColumnPair[]>([]);
  const [sampleLimit, setSampleLimit] = useState(50);

  const [submitting, setSubmitting] = useState(false);

  const loadLeftTables = useCallback(() => {
    setLeftTablesLoading(true);
    const params = new URLSearchParams({ filter: 'tables', env_schema: leftEnv });
    getApi('/assets/tables?' + params.toString())
      .then((res) => {
        setLeftTablesLoading(false);
        setLeftTables((res.ok && res.json?.tables) ? res.json.tables : []);
      })
      .catch(() => {
        setLeftTablesLoading(false);
        setLeftTables([]);
      });
  }, [leftEnv]);

  const loadRightTables = useCallback(() => {
    setRightTablesLoading(true);
    const params = new URLSearchParams({ filter: 'tables', env_schema: rightEnv });
    getApi('/assets/tables?' + params.toString())
      .then((res) => {
        setRightTablesLoading(false);
        setRightTables((res.ok && res.json?.tables) ? res.json.tables : []);
      })
      .catch(() => {
        setRightTablesLoading(false);
        setRightTables([]);
      });
  }, [rightEnv]);

  useEffect(() => {
    loadLeftTables();
  }, [loadLeftTables]);

  useEffect(() => {
    loadRightTables();
  }, [loadRightTables]);

  useEffect(() => {
    if (!leftTable || !rightTable) {
      setLeftColumns([]);
      setRightColumns([]);
      setJoinKeyPairs([]);
      setCompareColumnPairs([]);
      return;
    }
    if (leftTable.env_schema === rightTable.env_schema && leftTable.table_name === rightTable.table_name) {
      setLeftColumns([]);
      setRightColumns([]);
      setJoinKeyPairs([]);
      setCompareColumnPairs([]);
      return;
    }
    setColumnsLoading(true);
    Promise.all([
      getApi(`/assets/table-columns?env_schema=${encodeURIComponent(leftTable.env_schema)}&table_name=${encodeURIComponent(leftTable.table_name)}`),
      getApi(`/assets/table-columns?env_schema=${encodeURIComponent(rightTable.env_schema)}&table_name=${encodeURIComponent(rightTable.table_name)}`),
    ])
      .then(([leftRes, rightRes]) => {
        setColumnsLoading(false);
        setLeftColumns((leftRes.ok && leftRes.json?.columns) ? leftRes.json.columns : []);
        setRightColumns((rightRes.ok && rightRes.json?.columns) ? rightRes.json.columns : []);
        setJoinKeyPairs([]);
        setCompareColumnPairs([]);
      })
      .catch(() => {
        setColumnsLoading(false);
        setLeftColumns([]);
        setRightColumns([]);
        setJoinKeyPairs([]);
        setCompareColumnPairs([]);
      });
  }, [leftTable?.env_schema, leftTable?.table_name, rightTable?.env_schema, rightTable?.table_name]);

  const addJoinKeyPair = () => {
    setJoinKeyPairs((prev) => [...prev, { left: leftColumns[0] ?? '', right: rightColumns[0] ?? '' }]);
  };

  const updateJoinKeyPair = (index: number, field: 'left' | 'right', value: string) => {
    setJoinKeyPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeJoinKeyPair = (index: number) => {
    setJoinKeyPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const addCompareColumnPair = () => {
    setCompareColumnPairs((prev) => [...prev, { left: leftColumns[0] ?? '', right: rightColumns[0] ?? '' }]);
  };

  const updateCompareColumnPair = (index: number, field: 'left' | 'right', value: string) => {
    setCompareColumnPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeCompareColumnPair = (index: number) => {
    setCompareColumnPairs((prev) => prev.filter((_, i) => i !== index));
  };

  const autoMatchSimilarNames = () => {
    const common = leftColumns.filter((c) => rightColumns.includes(c));
    if (common.length === 0) {
      toast('No columns with matching names found in both tables.', 'error');
      return;
    }
    const pairs: ColumnPair[] = common.map((c) => ({ left: c, right: c }));
    setCompareColumnPairs((prev) => {
      const existing = new Set(prev.map((p) => `${p.left}:${p.right}`));
      const added = pairs.filter((p) => !existing.has(`${p.left}:${p.right}`));
      return [...prev, ...added];
    });
    toast(`Auto-matched ${common.length} column(s) for comparison: ${common.join(', ')}`, 'success');
  };

  const handleSubmit = async () => {
    if (!leftTable || !rightTable) {
      toast('Select both tables.', 'error');
      return;
    }
    const leftPtTrim = leftPt.trim() || undefined;
    const rightPtTrim = rightPt.trim() || undefined;
    // Sanitize pairs: API requires both left and right on every pair (no undefined/empty)
    const sanitizePair = (p: ColumnPair): { left: string; right: string } | null => {
      const left = typeof p.left === 'string' ? p.left.trim() : '';
      const right = typeof p.right === 'string' ? p.right.trim() : '';
      return left && right ? { left, right } : null;
    };
    const validJoinPairs = joinKeyPairs.map(sanitizePair).filter((p): p is { left: string; right: string } => p !== null);
    if (validJoinPairs.length === 0) {
      toast('Add at least one join key pair (left column ↔ right column).', 'error');
      return;
    }
    const validComparePairs = compareColumnPairs.map(sanitizePair).filter((p): p is { left: string; right: string } => p !== null);
    const payload: Record<string, unknown> = {
      left_table: leftTable.table_name,
      right_table: rightTable.table_name,
      left_env_schema: leftTable.env_schema ?? 'dev',
      right_env_schema: rightTable.env_schema ?? 'dev',
      join_keys: validJoinPairs.map((p) => p.left),
      join_key_pairs: validJoinPairs,
      compare_column_pairs: validComparePairs.length > 0 ? validComparePairs : null,
      sample_limit: sampleLimit,
    };
    if (leftPtTrim) payload.left_pt = leftPtTrim;
    if (rightPtTrim) payload.right_pt = rightPtTrim;

    toast('Starting comparison…', 'success');
    navigate('/compare/runs', { state: { submitPayload: payload } });
    setSubmitting(false);
  };

  const canShowMapping = leftTable && rightTable;
  const hasColumns = leftColumns.length > 0 && rightColumns.length > 0;

  return (
    <section id="view-compare" className="section view">
      <h2>Compare tables</h2>
      <p className="subtitle">
        Select two tables (from any environment), choose join keys and columns to compare, then submit. Compare dev vs prod.
      </p>
      <div className="card">
        <div className="compare-form">
          <div className="compare-two-cols">
            <div className="compare-col">
              <label>Left environment</label>
              <select value={leftEnv} onChange={(e) => { setLeftEnv(e.target.value); setLeftTable(null); }}>
                <option value="dev">dev</option>
                <option value="prod">prod</option>
              </select>
              <label>Left table</label>
              <select
                value={leftTable ? `${leftTable.env_schema}.${leftTable.table_name}` : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = leftTables.find((x) => `${x.env_schema}.${x.table_name}` === v);
                  setLeftTable(t || null);
                }}
              >
                <option value="">— Select —</option>
                {leftTables.map((t) => (
                  <option key={`${t.env_schema}.${t.table_name}`} value={`${t.env_schema}.${t.table_name}`}>
                    {t.table_name}
                  </option>
                ))}
              </select>
              <label>PT</label>
              <input
                type="text"
                placeholder="Optional: e.g. 20260101 (daily) or 2026010123 (hourly). Leave blank for non-partitioned tables."
                value={leftPt}
                onChange={(e) => setLeftPt(e.target.value)}
              />
            </div>
            <div className="compare-col">
              <label>Right environment</label>
              <select value={rightEnv} onChange={(e) => { setRightEnv(e.target.value); setRightTable(null); }}>
                <option value="dev">dev</option>
                <option value="prod">prod</option>
              </select>
              <label>Right table</label>
              <select
                value={rightTable ? `${rightTable.env_schema}.${rightTable.table_name}` : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const t = rightTables.find((x) => `${x.env_schema}.${x.table_name}` === v);
                  setRightTable(t || null);
                }}
              >
                <option value="">— Select —</option>
                {rightTables.map((t) => (
                  <option key={`${t.env_schema}.${t.table_name}`} value={`${t.env_schema}.${t.table_name}`}>
                    {t.table_name}
                  </option>
                ))}
              </select>
              <label>PT</label>
              <input
                type="text"
                placeholder="Optional: e.g. 20260101 (daily) or 2026010123 (hourly). Leave blank for non-partitioned tables."
                value={rightPt}
                onChange={(e) => setRightPt(e.target.value)}
              />
            </div>
          </div>

          {(leftTablesLoading || rightTablesLoading) && <p className="text-muted">Loading tables…</p>}

          {canShowMapping && (
            <>
              <div className="compare-section">
                <h4>Join keys</h4>
                <p className="compare-hint">Map left columns to right columns for the join. At least one pair required.</p>
                {columnsLoading ? (
                  <p className="text-muted">Loading columns…</p>
                ) : !hasColumns ? (
                  <p className="text-muted">No columns found. Ensure both tables exist and have columns.</p>
                ) : (
                  <>
                    <div className="compare-pairs">
                      {joinKeyPairs.map((pair, i) => (
                        <div key={i} className="compare-pair-row">
                          <select
                            value={pair.left}
                            onChange={(e) => updateJoinKeyPair(i, 'left', e.target.value)}
                            className="compare-select"
                          >
                            <option value="">— Left —</option>
                            {leftColumns.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <span className="compare-pair-arrow">↔</span>
                          <select
                            value={pair.right}
                            onChange={(e) => updateJoinKeyPair(i, 'right', e.target.value)}
                            className="compare-select"
                          >
                            <option value="">— Right —</option>
                            {rightColumns.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="compare-remove-btn"
                            onClick={() => removeJoinKeyPair(i)}
                            aria-label="Remove pair"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="secondary compare-add-btn" onClick={addJoinKeyPair}>
                      + Add join key
                    </button>
                  </>
                )}
              </div>

              <div className="compare-section">
                <h4>Compare columns</h4>
                <p className="compare-hint">Map columns for value comparison (optional).</p>
                {!columnsLoading && hasColumns && (
                  <>
                    <button type="button" className="secondary compare-add-btn" onClick={autoMatchSimilarNames}>
                      Auto-match similar names
                    </button>
                    <div className="compare-pairs">
                      {compareColumnPairs.map((pair, i) => (
                        <div key={i} className="compare-pair-row">
                          <select
                            value={pair.left}
                            onChange={(e) => updateCompareColumnPair(i, 'left', e.target.value)}
                            className="compare-select"
                          >
                            <option value="">— Left —</option>
                            {leftColumns.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <span className="compare-pair-arrow">↔</span>
                          <select
                            value={pair.right}
                            onChange={(e) => updateCompareColumnPair(i, 'right', e.target.value)}
                            className="compare-select"
                          >
                            <option value="">— Right —</option>
                            {rightColumns.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="compare-remove-btn"
                            onClick={() => removeCompareColumnPair(i)}
                            aria-label="Remove pair"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="secondary compare-add-btn" onClick={addCompareColumnPair}>
                      + Add compare column
                    </button>
                  </>
                )}
              </div>

              <div className="compare-row">
                <label>Sample limit</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={sampleLimit}
                  onChange={(e) => setSampleLimit(Number(e.target.value))}
                />
              </div>

              <div className="compare-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={handleSubmit}
                  disabled={submitting || joinKeyPairs.filter((p) => p.left && p.right).length === 0}
                >
                  {submitting ? 'Submitting…' : 'Submit comparison'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
