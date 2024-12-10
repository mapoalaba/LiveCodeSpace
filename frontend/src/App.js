import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, Link, useNavigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import NewProject from "./pages/NewProject";
import Workspace from "./pages/Workspace";
import PrivateRoute from "./components/common/PrivateRoute";
import Header from "./pages/Header";

// Logout Button Component
function LogoutButton({ onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token"); // Remove JWT token
    onLogout(); // Update state
    navigate("/login"); // Redirect to login page
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        marginLeft: "15px",
        backgroundColor: "transparent",
        border: "none",
        color: "#61dafb",
        cursor: "pointer",
      }}
    >
      Logout
    </button>
  );
}

function App() {
  const [token, setToken] = useState(null);

  // Retrieve token from localStorage on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
  }, []);

  // Login function to update token state
  const handleLogin = (newToken) => {
    localStorage.setItem("token", newToken); // Save token to localStorage
    setToken(newToken); // Update React state
  };

  // Logout function to clear token state
  const handleLogout = () => {
    setToken(null);
  };

  return (
    <Router>
      <div>
        <Header />
        {/* {<nav style={{ padding: "10px", backgroundColor: "#282c34" }}>
          <Link to="/" style={{ marginRight: "15px", color: "#61dafb" }}>
            Home
          </Link>
          {!token ? (
            <>
              <Link to="/register" style={{ marginRight: "15px", color: "#61dafb" }}>
                Register
              </Link>
              <Link to="/login" style={{ color: "#61dafb" }}>
                Login
              </Link>
            </>
          ) : (
            <LogoutButton onLogout={handleLogout} />
          )}
        </nav>} */}
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Navigate to="/home" />} />
          <Route path="/home" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute token={token}>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/new-project"
            element={
              <PrivateRoute token={token}>
                <NewProject />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspace/:projectId"
            element={
              <PrivateRoute token={token}>
                <Workspace />
              </PrivateRoute>
            }
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;