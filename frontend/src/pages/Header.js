import React, { useEffect, useState } from 'react';
import '../styles/Header.css';

const Header = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const loginStatus = localStorage.getItem('isLoggedIn') === 'true';
    setIsLoggedIn(loginStatus);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.setItem('isLoggedIn', 'false');
    setIsLoggedIn(false);
    window.location.href = '/login';
  };

  return (
    <header className="header-container">
      <div className="header-left">
        <h1
          className="header-logo"
          onClick={() => (window.location.href = '/Home')}
        >
          LiveCodeSpace
        </h1>
      </div>
      <div className="header-right">
        {isLoggedIn ? (
          <>
            <button
              className="header-dashboard-button"
              onClick={() => (window.location.href = '/dashboard')}
            >
              대시보드로 이동
            </button>
            <button
              className="header-logout-button"
              onClick={handleLogout}
            >
              로그아웃
            </button>
          </>
        ) : (
          <button
            className="header-login-button"
            onClick={() => (window.location.href = '/login')}
          >
            로그인
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
