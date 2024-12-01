import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useNavigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import NewProject from "./pages/NewProject";
import Workspace from "./pages/Workspace";
import PrivateRoute from "./components/PrivateRoute"; // PrivateRoute 추가

function LogoutButton({ onLogout }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token"); // JWT 토큰 제거
    onLogout(); // 상태 업데이트
    navigate("/login"); // 로그인 페이지로 리다이렉트
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

  // localStorage에서 토큰 읽기
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    setToken(storedToken);
  }, []);

  // 로그인 후 토큰 상태 업데이트 함수
  const handleLogin = (newToken) => {
    localStorage.setItem("token", newToken); // localStorage에 토큰 저장
    setToken(newToken); // React 상태 업데이트
  };

  // 로그아웃 후 토큰 상태 제거 함수
  const handleLogout = () => {
    setToken(null);
  };

  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<Navigate to="/home" />} />
          <Route path="/home" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
        </Routes>
        <Routes>
          {/* 공개 페이지 */}
          <Route path="/" element={<div>Welcome to LiveCodeSpace</div>} />
          <Route
            path="/register"
            element={<Register />}
          />
          <Route
            path="/login"
            element={<Login onLogin={handleLogin} />}
          />

          {/* 보호된 페이지 */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/new-project"
            element={
              <PrivateRoute>
                <NewProject />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspace/:projectId"
            element={
              <PrivateRoute>
                <Workspace />
              </PrivateRoute>
            }
          />
          <Route
            path="/workspace/:projectId"
            element={
              <PrivateRoute>
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