import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="view hero-section" id="view-home">
      <div className="hero">
        <h1>Schema, compare & validate <span className="accent">in one place</span></h1>
        <p>Parse and apply DDL, suggest join keys, run table comparisons, and validate data quality—all from your browser.</p>
        <div className="feature-cards feature-cards-grid-6">
          <Link to="/assets" className="feature-card">
            <h3>Assets</h3>
            <p>View all tables created via this app. Create new tables or schedule a table for deletion (renamed, dropped in 7 days).</p>
          </Link>
          <Link to="/ddl" className="feature-card">
            <h3>DDL</h3>
            <p>Parse CREATE TABLE statements and apply them to dev or prod. Schema and table registry updated automatically.</p>
          </Link>
          <Link to="/compare" className="feature-card">
            <h3>Compare</h3>
            <p>Suggest join keys between two tables, then run a comparison to see row counts and missing keys on each side.</p>
          </Link>
          <Link to="/compare/runs" className="feature-card">
            <h3>Comparison runs</h3>
            <p>View past table comparisons. See status, results, and column-wise diffs for each run.</p>
          </Link>
          <Link to="/validate" className="feature-card">
            <h3>Validate</h3>
            <p>Run checks on a table: row count, null counts per column, and duplicate row detection.</p>
          </Link>
          <Link to="/validate/runs" className="feature-card">
            <h3>Validation runs</h3>
            <p>View past validation results. See null counts per column and duplicate row counts.</p>
          </Link>
        </div>
      </div>
    </section>
  );
}
