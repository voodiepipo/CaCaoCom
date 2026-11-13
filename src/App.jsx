import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import FarmerProfiles from "./pages/FarmerProfiles.jsx";
import PlotVerification from "./pages/PlotVerification.jsx";
import AuditLogs from "./pages/AuditLogs.jsx";
import EudrExport from "./pages/EudrExport.jsx";


function Protected({ children, allowedRoles }) {
  const token = localStorage.getItem("cocao_token");
  
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  
  const user = JSON.parse(localStorage.getItem("cocao_user") || "{}");

  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/plots" replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      
      <Route element={<Protected><Layout /></Protected>}>
        
        
        <Route 
          path="/plots" 
          element={
            <Protected allowedRoles={["agent", "admin", "manager"]}>
              <PlotVerification />
            </Protected>
          } 
        />

        
        <Route 
          path="/dashboard" 
          element={
            <Protected allowedRoles={["admin", "manager"]}>
              <Dashboard />
            </Protected>
          } 
        />
        <Route 
          path="/farmers" 
          element={
            <Protected allowedRoles={["admin", "manager"]}>
              <FarmerProfiles />
            </Protected>
          } 
        />

        
        <Route 
          path="/audit" 
          element={
            <Protected allowedRoles={["admin", "manager"]}>
              <AuditLogs />
            </Protected>
          } 
        />
        <Route 
          path="/eudr" 
          element={
            <Protected allowedRoles={["admin", "manager"]}>
              <EudrExport />
            </Protected>
          } 
        />
      </Route>

      
      <Route path="*" element={<Navigate to="/plots" replace />} />
    </Routes>
  );
}