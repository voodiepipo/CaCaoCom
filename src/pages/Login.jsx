import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";
import { IMAGES } from "../config/images.js"; 

export default function Login() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      
      const data = await api.login(identifier, password);
      const token = data.token || data; 

      
      let role = "agent";       
      let fullName = identifier;

      const lowerEmail = identifier.toLowerCase();

      
      if (lowerEmail.includes("kofi") || lowerEmail.includes("director") || lowerEmail.includes("manager")) {
        role = "manager"; 
        fullName = "Kofi Boateng";
      } else if (lowerEmail.includes("admin")) {
        role = "admin";   
        fullName = "System Admin";
      } else {
        role = "agent";   
        fullName = "Field Agent";
      }

      
      const user = {
        user_id: identifier,
        full_name: fullName,
        role: role 
      };

      
      localStorage.setItem("cocao_token", token);
      localStorage.setItem("cocao_user", JSON.stringify(user));

      
      if (role === "manager" || role === "admin") {
        navigate("/dashboard");
      } else {
        navigate("/plots"); 
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-page">
      
      <div 
        className="login-hero" 
        style={{ backgroundImage: `url(${IMAGES.loginBg})` }} 
      />
      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-logo">
            
            <img 
              src={IMAGES.logo} 
              alt="Cocao.com Logo" 
              style={{ width: "54px", height: "54px", objectFit: "contain", borderRadius: "50%" }} 
            />
            <span className="login-logo-text">Cocao<span>.com</span></span>
          </div>

          <h1>Welcome to cocao.com</h1>
          <p className="tagline">Empowering Sustainable Sourcing &amp; Zero-Deforestation Compliance</p>

          <label htmlFor="identifier">Email Address or Agent ID</label>
          <input
            id="identifier"
            type="text"
            placeholder="e.g., email@cocao.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}