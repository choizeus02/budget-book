import { BrowserRouter, Route, Routes } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import { CategoriesProvider } from "./contexts/CategoriesContext";
import AddTransaction from "./pages/AddTransaction";
import Settings from "./pages/Settings";
import Home from "./pages/Home";
import Installments from "./pages/Installments";
import Stats from "./pages/Stats";
import Transactions from "./pages/Transactions";

export default function App() {
  return (
    <CategoriesProvider>
    <BrowserRouter basename="/budget">
      <Routes>
        {/* 풀스크린 (BottomNav 없음) */}
        <Route path="/add" element={<AddTransaction />} />

        {/* 일반 레이아웃 */}
        <Route
          path="/*"
          element={
            <>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/installments" element={<Installments />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
              <BottomNav />
            </>
          }
        />
      </Routes>
    </BrowserRouter>
    </CategoriesProvider>
  );
}

