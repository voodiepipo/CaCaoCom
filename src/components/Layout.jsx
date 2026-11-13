import { NavLink, Outlet, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "manager"] },
  { to: "/farmers", label: "Farmer Profiles", roles: ["admin", "manager"] },
  { to: "/plots", label: "Plot Verification", roles: ["agent", "admin", "manager"] },
  { to: "/audit", label: "Audit Logs", roles: ["admin", "manager"] },   
  { to: "/eudr", label: "EUDR Export", roles: ["admin", "manager"] },    
];

export function BrandText() {
  // "Cocao.com" with the two yellow "o" letters as in the design
  return (
    <span className="brand-text">
      C<span className="y">o</span>ca<span className="y">o</span>.com
    </span>
  );
}

export default function Layout() {
  const navigate = useNavigate();
  
  
  const user = JSON.parse(localStorage.getItem("cocao_user") || "{}");
  const userRole = user.role || "agent"; 

  const logout = () => {
    localStorage.removeItem("cocao_token");
    localStorage.removeItem("cocao_user");
    navigate("/login");
  };

  
  const filteredNav = NAV.filter((n) => n.roles.includes(userRole));

  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandText />
        <button className="link-btn" onClick={logout}>Sign out</button>
      </header>
      <div className="app-body">
        <nav className="sidebar">
          {filteredNav.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}