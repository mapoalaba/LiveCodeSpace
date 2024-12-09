import React, { useEffect, useState } from 'react';
import '../styles/Header.css';

const Header = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHome, setIsHome] = useState(false);

  useEffect(() => {
    // 현재 경로가 홈인지 확인
    setIsHome(window.location.pathname === '/Home' || window.location.pathname === '/');
    
    // 경로 변경 감지
    const handleLocationChange = () => {
      setIsHome(window.location.pathname === '/Home' || window.location.pathname === '/');
    };

    window.addEventListener('popstate', handleLocationChange);

    // 초기 로그인 상태 확인
    const loginStatus = localStorage.getItem('isLoggedIn') === 'true';
    setIsLoggedIn(loginStatus);

    // localStorage 변경 이벤트 리스너
    const handleStorageChange = () => {
      const newLoginStatus = localStorage.getItem('isLoggedIn') === 'true';
      setIsLoggedIn(newLoginStatus);
    };

    window.addEventListener('storage', handleStorageChange);
    // 컴포넌트가 마운트될 때마다 상태 체크
    window.addEventListener('load', handleStorageChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('load', handleStorageChange);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.setItem('isLoggedIn', 'false');
    setIsLoggedIn(false);
    window.location.href = '/login';
  };

  return (
    <header className={`header-container ${isHome ? 'fixed-header' : ''}`}>
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