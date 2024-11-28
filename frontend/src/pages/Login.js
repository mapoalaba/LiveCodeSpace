import React, { useState } from "react";
import "../styles/Login.css";

const Login = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [message, setMessage] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleLogin = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage("Login successful!");
        localStorage.setItem("token", data.token); // JWT 토큰 저장
      } else {
        setMessage(data.error || "Login failed.");
      }
    } catch (error) {
      setMessage("Error: " + error.message);
    }
  };

  return (
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
            value={formData.email}
            onChange={handleChange}
          />
          <input
            type="password"
            name="password"
            placeholder="비밀번호"
            value={formData.password}
            onChange={handleChange}
          />
          <button className="login-btn" onClick={handleLogin}>
            로그인
          </button>
          <p>{message}</p>
        </div>
        <div className="signup-link">
          <p>계정이 없으신가요? <a href="/register">회원가입</a></p>
        </div>
      </div>
    </div>
  );
};

export default Login;