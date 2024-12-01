import React from 'react';
import '../styles/Header.css';

const Header = () => {
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
        <button
          className="header-login-button"
          onClick={() => (window.location.href = '/login')}
        >
          로그인
        </button>
      </div>
    </header>
  );
};

export default Header;