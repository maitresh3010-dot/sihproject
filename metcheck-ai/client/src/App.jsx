import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import { ToastProvider } from "./components/ui";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ScanProduct from "./pages/ScanProduct";
import ScanResult from "./pages/ScanResult";
import Inspections from "./pages/Inspections";
import InspectionDetails from "./pages/InspectionDetails";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import Reports from "./pages/Reports";
import Rules from "./pages/Rules";
import Users from "./pages/Users";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";

function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (<><Navbar onMenu={() => setOpen(!open)} /><div className="app-shell">
    <Sidebar open={open} onClose={close} />
    {open && <div className="backdrop" onClick={close} aria-hidden="true" />}
    <main className="main">{children}</main></div></>);
}

const P = (el, roles) => <ProtectedRoute roles={roles}><Layout>{el}</Layout></ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider><ToastProvider><BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={P(<Dashboard />)} />
        <Route path="/scan" element={P(<ScanProduct />, ["ADMIN", "OFFICER"])} />
        <Route path="/scan/:id" element={P(<ScanResult />)} />
        <Route path="/inspections" element={P(<Inspections />)} />
        <Route path="/inspections/:id" element={P(<InspectionDetails />)} />
        <Route path="/products" element={P(<Products />)} />
        <Route path="/products/:name" element={P(<ProductDetails />)} />
        <Route path="/reports" element={P(<Reports />)} />
        <Route path="/rules" element={P(<Rules />, ["ADMIN"])} />
        <Route path="/users" element={P(<Users />, ["ADMIN"])} />
        <Route path="/profile" element={P(<Profile />)} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter></ToastProvider></AuthProvider>
  );
}
