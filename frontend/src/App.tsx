import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Assets from './pages/Assets';
import DDL from './pages/DDL';
import Compare from './pages/Compare';
import CompareRuns from './pages/CompareRuns';
import Validate from './pages/Validate';
import ValidateRuns from './pages/ValidateRuns';
import Query from './pages/Query';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="assets" element={<Assets />} />
                <Route path="create-table" element={<DDL />} />
                <Route path="compare" element={<Compare />} />
                <Route path="compare/runs" element={<CompareRuns />} />
                <Route path="validate" element={<Validate />} />
                <Route path="validate/runs" element={<ValidateRuns />} />
                <Route path="query" element={<Query />} />
              </Route>
            </Routes>
            </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
