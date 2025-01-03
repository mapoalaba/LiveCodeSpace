import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Login.css";


const Login = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('isLoggedIn', 'true'); // 로그인 상태 저장
        localStorage.setItem('token', data.token);
        localStorage.setItem('userName', data.name); // 사용자 이름 저장
        onLogin(data.token); // App.js의 handleLogin 호출
        window.location.href = '/dashboard'; // navigate 대신 사용
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError("An error occurred during login");
    }
  };

  return (
    <div>
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <h2>실시간으로 협업</h2>
            <h1>LiveCodeSpace</h1>
          </div>
          <div className="login-form">
          <input
            type="email"
            name="email"
            placeholder="이메일 주소를 입력하세요."
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />  
            <button className="login-btn" onClick={handleLogin}>
              로그인
            </button>
            {error && <p>{error}</p>}
          </div>
          <div className="signup-link">
            <p>계정이 없으신가요? <a href="/register">회원가입</a></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;