import React, { useState } from "react";
import { useNavigate } from "react-router-dom";  // 추가
import "../styles/Register.css";

const RegisterAndVerify = () => {
  const navigate = useNavigate();  // 추가
  const [step, setStep] = useState(1); // 1: Register, 2: Verify
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    jobTitle: "",
    code: "",
  });
  const [errors, setErrors] = useState({}); // 에러 상태 추가
  const [message, setMessage] = useState("");
  const [errorMessages, setErrorMessages] = useState({});  // ���가

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return hasUpperCase && hasSpecialChar;
  };

  // 입력값 변경 처리
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    // 입력 시 해당 필드의 에러 제거
    setErrors(prev => ({ ...prev, [name]: false }));

    // 실시간 유효성 검사
    if (name === 'email') {
      if (!validateEmail(value)) {
        setErrorMessages(prev => ({
          ...prev,
          email: '유효한 이메일 주소를 입력해주세요.'
        }));
        setErrors(prev => ({ ...prev, email: true }));
      } else {
        setErrorMessages(prev => ({ ...prev, email: '' }));
        setErrors(prev => ({ ...prev, email: false }));
      }
    }
    
    if (name === 'password') {
      if (!validatePassword(value)) {
        setErrorMessages(prev => ({
          ...prev,
          password: '비밀번호는 최소 하나의 대문자와 특수문자를 포함해야 합니다.'
        }));
        setErrors(prev => ({ ...prev, password: true }));
      } else {
        setErrorMessages(prev => ({ ...prev, password: '' }));
        setErrors(prev => ({ ...prev, password: false }));
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const newErrorMessages = {};

    if (step === 1) {
      if (!formData.name) {
        newErrors.name = true;
        newErrorMessages.name = '이름을 입력해주세요.';
      }
      
      if (!formData.email || !validateEmail(formData.email)) {
        newErrors.email = true;
        newErrorMessages.email = '유효한 이메일 주소를 입력해주세요.';
      }
      
      if (!formData.password || !validatePassword(formData.password)) {
        newErrors.password = true;
        newErrorMessages.password = '비밀번호는 최소 하나의 대문자와 특수문자를 포함해야 합니다.';
      }
      
      if (!formData.jobTitle) {
        newErrors.jobTitle = true;
        newErrorMessages.jobTitle = '직무를 입력해주세요.';
      }
    }

    if (step === 2 && !formData.code) {
      newErrors.code = true;
      newErrorMessages.code = '확인 코드를 입력해주세요.';
    }

    setErrors(newErrors);
    setErrorMessages(newErrorMessages);
    return Object.keys(newErrors).length === 0;
  };

  // 회원가입 처리
  const handleRegister = async () => {
    if (!validateForm()) {
      setMessage("모든 필드를 입력해주세요.");
      return;
    }
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
    if (!validateForm()) {
      setMessage("확인 코드를 입력해주세요.");
      return;
    }
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
        setTimeout(() => {
          navigate('/login');  // Login 페이지로 리다이렉트
        }, 1500);  // 1.5초 후 리다이렉트
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
      <div className="register-container">
        <div className="register-box">
          {step === 1 ? (
            // Registration form
            <div className="register-form">
              <h1>LiveCodeSpace 계정 등록</h1>
              <div className="input-container">
                {errorMessages.name && <p className="error-message">{errorMessages.name}</p>}
                <input
                  type="text"
                  name="name"
                  placeholder="이름"
                  value={formData.name}
                  onChange={handleChange}
                  className={errors.name ? 'error' : ''}
                />
              </div>
              <div className="input-container">
                {errorMessages.email && <p className="error-message">{errorMessages.email}</p>}
                <input
                  type="email"
                  name="email"
                  placeholder="이메일 주소"
                  value={formData.email}
                  onChange={handleChange}
                  className={errors.email ? 'error' : ''}
                />
              </div>
              <div className="input-container">
                {errorMessages.password && <p className="error-message">{errorMessages.password}</p>}
                <input
                  type="password"
                  name="password"
                  placeholder="비밀번호"
                  value={formData.password}
                  onChange={handleChange}
                  className={errors.password ? 'error' : ''}
                />
              </div>
              <div className="input-container">
                {errorMessages.jobTitle && <p className="error-message">{errorMessages.jobTitle}</p>}
                <input
                  type="text"
                  name="jobTitle"
                  placeholder="직무"
                  value={formData.jobTitle}
                  onChange={handleChange}
                  className={errors.jobTitle ? 'error' : ''}
                />
              </div>
              <button onClick={handleRegister}>회원가입</button>
              <p>{message}</p>
            </div>
          ) : (
            // Email verification form
            <div className="verify-form">
              <h1>이메일 확인</h1>
              <p>확인 코드가 이메일로 전송되었습니다. 아래에 입력해주세요.</p>
              <div className="input-container">
                <input
                  type="email"
                  name="email"
                  placeholder="이메일"
                  value={formData.email}
                  onChange={handleChange}
                  disabled
                />
              </div>
              <div className="input-container">
                {errorMessages.code && <p className="error-message">{errorMessages.code}</p>}
                <input
                  type="text"
                  name="code"
                  placeholder="확인 코드 입력"
                  value={formData.code}
                  onChange={handleChange}
                  className={errors.code ? 'error' : ''}
                />
              </div>
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