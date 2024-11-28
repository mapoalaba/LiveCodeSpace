import React, { useState } from "react";

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
      {step === 1 ? (
        // 회원가입 양식
        <div>
          <h1>Register</h1>
          <input
            type="text"
            name="name"
            placeholder="Name"
            value={formData.name}
            onChange={handleChange}
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
          />
          <input
            type="text"
            name="jobTitle"
            placeholder="Job Title"
            value={formData.jobTitle}
            onChange={handleChange}
          />
          <button onClick={handleRegister}>Register</button>
          <p>{message}</p>
        </div>
      ) : (
        // 이메일 확인 양식
        <div>
          <h1>Verify Email</h1>
          <p>A confirmation code has been sent to your email. Please enter it below.</p>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            disabled // 이메일 변경 불가능
          />
          <input
            type="text"
            name="code"
            placeholder="Enter confirmation code"
            value={formData.code}
            onChange={handleChange}
          />
          <button onClick={handleVerify}>Verify Email</button>
          <button onClick={handleResendCode}>Resend Code</button>
          <p>{message}</p>
        </div>
      )}
    </div>
  );
};

export default RegisterAndVerify;