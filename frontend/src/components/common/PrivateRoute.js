import React from "react";
import { Navigate } from "react-router-dom";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  // 토큰이 없으면 로그인 페이지로 리다이렉트
  if (!token) {
    return <Navigate to="/login" />;
  }

  // 토큰이 있으면 페이지 렌더링
  return children;
};

export default PrivateRoute;