import React, { useState } from "react";
import Header from './Header.js';
import "../styles/Register.css";

const RegisterAndVerify = () => {
  const [step, setStep] = useState(1); // 1: Register, 2: Verify
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    jobTitle: "",
    code: "",
  });
  const [message, setMessage] = useState("");

  // 입력값 변경 처리
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // 회원가입 처리
  const handleRegister = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          jobTitle: formData.jobTitle,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage("Registration successful! Please check your email for the confirmation code.");
        setStep(2); // 이메일 확인 단계로 이동
      } else {
        setMessage(data.error || "Registration failed.");
      }
    } catch (error) {
      setMessage("Error: " + error.message);
    }
  };

  // 이메일 확인 처리
  const handleVerify = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          code: formData.code,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage("Email verified successfully! You can now log in.");
      } else {
        setMessage(data.error || "Verification failed.");
      }
    } catch (error) {
      setMessage("Error: " + error.message);
    }
  };

  // 확인 코드 재전송
  const handleResendCode = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/resend-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage("Confirmation code resent to your email.");
      } else {
        setMessage(data.error || "Failed to resend confirmation code.");
      }
    } catch (error) {
      setMessage("Error: " + error.message);
    }
  };

  return (
    <div>
      <Header />
      <div className="register-container">
        <div className="register-box">
          {step === 1 ? (
            // Registration form
            <div className="register-form">
              <h1>LiveCodeSpace 계정 등록</h1>
              <input
                type="text"
                name="name"
                placeholder="이름"
                value={formData.name}
                onChange={handleChange}
              />
              <input
                type="email"
                name="email"
                placeholder="이메일 주소"
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
              <input
                type="text"
                name="jobTitle"
                placeholder="직무"
                value={formData.jobTitle}
                onChange={handleChange}
              />
              <button onClick={handleRegister}>회원가입</button>
              <p>{message}</p>
            </div>
          ) : (
            // Email verification form
            <div className="verify-form">
              <h1>이메일 확인</h1>
              <p>확인 코드가 이메일로 전송되었습니다. 아래에 입력해주세요.</p>
              <input
                type="email"
                name="email"
                placeholder="이메일"
                value={formData.email}
                onChange={handleChange}
                disabled
              />
              <input
                type="text"
                name="code"
                placeholder="확인 코드 입력"
                value={formData.code}
                onChange={handleChange}
              />
              <button onClick={handleVerify}>이메일 인증</button>
              <button onClick={handleResendCode}>코드 재전송</button>
              <p>{message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterAndVerify;