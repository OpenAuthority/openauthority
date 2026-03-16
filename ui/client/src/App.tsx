import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { Home } from "./pages/Home";
import { Authorities } from "./pages/Authorities";
import { Settings } from "./pages/Settings";
import { AuditLog } from "./pages/AuditLog";
import { CoverageMap } from "./pages/CoverageMap";

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/authorities" element={<Authorities />} />
            <Route path="/audit-log" element={<AuditLog />} />
            <Route path="/coverage-map" element={<CoverageMap />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
