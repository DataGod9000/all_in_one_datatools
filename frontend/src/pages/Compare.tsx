import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getApi } from '../api';
import { useToast } from '../context/ToastContext';
import type { TableRow } from '../types';

interface Candidate {
  column: string;
  data_type: string;
  score: number;
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

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [joinKeys, setJoinKeys] = useState<string[]>([]);
  const [compareColumns, setCompareColumns] = useState<Record<string, boolean>>({});
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
      setCandidates([]);
      setJoinKeys([]);
      setCompareColumns({});
      return;
    }
    const lp = leftPt.trim();
    const rp = rightPt.trim();
    if (!lp || !rp) {
      setCandidates([]);
      setJoinKeys([]);
      setCompareColumns({});
      return;
    }
    if (leftTable.env_schema === rightTable.env_schema && leftTable.table_name === rightTable.table_name) {
      setCandidates([]);
      setJoinKeys([]);
      setCompareColumns({});
      return;
    }
    setCandidatesLoading(true);
    api('/compare/suggest-keys', {
      left_table: leftTable.table_name,
      right_table: rightTable.table_name,
      left_pt: lp,
      right_pt: rp,
      left_env_schema: leftTable.env_schema,
      right_env_schema: rightTable.env_schema,
      max_candidates: 50,
    })
      .then((res) => {
        setCandidatesLoading(false);
        if (res.ok && res.json?.candidates) {
          const c = res.json.candidates as Candidate[];
          setCandidates(c);
          setJoinKeys((prev) => prev.filter((k) => c.some((x) => x.column === k)));
          setCompareColumns((prev) => {
            const next = { ...prev };
            c.forEach((x) => {
              if (!(x.column in next)) next[x.column] = true;
            });
            return next;
          });
        } else {
          setCandidates([]);
        }
      })
      .catch(() => {
        setCandidatesLoading(false);
        setCandidates([]);
      });
  }, [leftTable?.env_schema, leftTable?.table_name, rightTable?.env_schema, rightTable?.table_name, leftPt, rightPt]);

  const toggleJoinKey = (col: string) => {
    setJoinKeys((prev) =>
      prev.includes(col) ? prev.filter((k) => k !== col) : [...prev, col]
    );
  };

  const toggleCompareColumn = (col: string) => {
    setCompareColumns((prev) => ({ ...prev, [col]: !prev[col] }));
  };

  const handleSubmit = async () => {
    if (!leftTable || !rightTable) {
      toast('Select both tables.', 'error');
      return;
    }
    const leftPtTrim = leftPt.trim();
    const rightPtTrim = rightPt.trim();
    if (!leftPtTrim || !rightPtTrim) {
      toast('PT is required for both tables (e.g. 20260101 for daily, 2026010123 for hourly).', 'error');
      return;
    }
    if (joinKeys.length === 0) {
      toast('Select at least one join key.', 'error');
      return;
    }
    const cols = Object.entries(compareColumns)
      .filter(([, v]) => v)
      .map(([k]) => k);
    setSubmitting(true);
    const res = await api('/compare/run', {
      left_table: leftTable.table_name,
      right_table: rightTable.table_name,
      left_pt: leftPtTrim,
      right_pt: rightPtTrim,
      left_env_schema: leftTable.env_schema,
      right_env_schema: rightTable.env_schema,
      join_keys: joinKeys,
      compare_columns: cols.length ? cols : null,
      sample_limit: sampleLimit,
    });
    setSubmitting(false);
    if (res.ok) {
      toast('Comparison submitted successfully.', 'success');
      navigate('/compare/runs');
    } else {
      toast(res.json?.detail || 'Comparison failed', 'error');
    }
  };

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
              <label>PT <span className="compare-required">*</span></label>
              <input
                type="text"
                placeholder="e.g. 20260101 (daily) or 2026010123 (hourly)"
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
              <label>PT <span className="compare-required">*</span></label>
              <input
                type="text"
                placeholder="e.g. 20260101 (daily) or 2026010123 (hourly)"
                value={rightPt}
                onChange={(e) => setRightPt(e.target.value)}
              />
            </div>
          </div>

          {(leftTablesLoading || rightTablesLoading) && <p className="text-muted">Loading tables…</p>}

          {leftTable && rightTable && (
            <>
              <div className="compare-section">
                <h4>Join keys</h4>
                <p className="compare-hint">Select columns to join the two tables.</p>
                {candidatesLoading ? (
                  <p className="text-muted">Loading compatible columns…</p>
                ) : candidates.length === 0 ? (
                  <p className="text-muted">No common columns with matching types.</p>
                ) : (
                  <div className="compare-checkboxes">
                    {candidates.map((c) => (
                      <label key={c.column} className="compare-check">
                        <input
                          type="checkbox"
                          checked={joinKeys.includes(c.column)}
                          onChange={() => toggleJoinKey(c.column)}
                        />
                        <span>{c.column}</span>
                        <span className="compare-type">({c.data_type})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="compare-section">
                <h4>Compare columns</h4>
                <p className="compare-hint">Tick columns for column-wise value comparison.</p>
                {candidatesLoading ? null : candidates.length === 0 ? null : (
                  <div className="compare-checkboxes">
                    {candidates.map((c) => (
                      <label key={c.column} className="compare-check">
                        <input
                          type="checkbox"
                          checked={!!compareColumns[c.column]}
                          onChange={() => toggleCompareColumn(c.column)}
                        />
                        <span>{c.column}</span>
                        <span className="compare-type">({c.data_type})</span>
                      </label>
                    ))}
                  </div>
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
                  disabled={submitting || joinKeys.length === 0 || !leftPt.trim() || !rightPt.trim()}
                >
                  {submitting ? 'Submitting…' : 'Submit comparison'}
                </button>
                <button type="button" className="secondary" onClick={() => navigate('/compare/runs')}>
                  View runs
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
