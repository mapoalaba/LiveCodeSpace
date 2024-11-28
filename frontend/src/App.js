import React from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";

function App() {
  return (
    <Router>
      <div>
        <nav style={{ padding: "10px", backgroundColor: "#282c34" }}>
          <Link to="/" style={{ marginRight: "15px", color: "#61dafb" }}>
            Home
          </Link>
          <Link to="/register" style={{ marginRight: "15px", color: "#61dafb" }}>
            Register
          </Link>
          <Link to="/login" style={{ color: "#61dafb" }}>
            Login
          </Link>
        </nav>
        <Routes>
          <Route path="/" element={<div>Welcome to LiveCodeSpace</div>} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;