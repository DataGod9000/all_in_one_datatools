import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { QueryProvider } from './context/QueryContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import Assets from './pages/Assets';
import DDL from './pages/DDL';
import Compare from './pages/Compare';
import CompareRuns from './pages/CompareRuns';
import Validate from './pages/Validate';
import ValidateRuns from './pages/ValidateRuns';

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <QueryProvider>
            <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="assets" element={<Assets />} />
                <Route path="ddl" element={<DDL />} />
                <Route path="compare" element={<Compare />} />
                <Route path="compare/runs" element={<CompareRuns />} />
                <Route path="validate" element={<Validate />} />
                <Route path="validate/runs" element={<ValidateRuns />} />
              </Route>
            </Routes>
            </BrowserRouter>
          </QueryProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
