import React, { useEffect, useState } from 'react';
import '../styles/Home.css';
import hoseo from '../img/호서.webp';
import pic1 from '../img/pic1-1.avif';
import pic2 from '../img/pic2.jpg';
import pic3 from '../img//pic3.avif';
import pic4 from '../img/pic4.avif';
import pic5 from '../img/pic5.jpg';

const Home = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in');
          }
        });
      },
      { threshold: 0.1 }
    );

    // 로그인 상태 확인
    const loginStatus = localStorage.getItem('isLoggedIn') === 'true';
    setIsLoggedIn(loginStatus);

    const handleStorageChange = () => {
      const newLoginStatus = localStorage.getItem('isLoggedIn') === 'true';
      setIsLoggedIn(newLoginStatus);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('load', handleStorageChange);

    document.querySelectorAll('.home-header-margin-left, .home-large-image-space').forEach(
      (el) => observer.observe(el)
    );

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('load', handleStorageChange);
    };
  }, []);

  return (
    <div>
      <div className="home-container">
        <div className="home-header-with-image">
          <div className="home-header">
            <h1>아름다운 결<br />과물을 만들<br />어 내세요.</h1>
            <p>
              LiveCodeSpace와 함께하면 팀의 생산성은 향상되고 마음<br />
              에는 평화가 찾아옵니다.
            </p>
            {!isLoggedIn && (
              <button
                className="home-primary-button"
                onClick={() => (window.location.href = '/login')}
              >
                LiveCodeSpace 무료로 사용하기
              </button>
            )}
          </div>
          <div className="home-header-image">
            <img src={pic2} alt='pic2' className='home-image1' />
          </div>
        </div>

        <div className="home-partners">
          <p>LiveCodeSpace를 사용하는 파트너</p>
          <div className="home-partner-logos">
            <a href="https://www.shoseo.ac.kr/" target="_blank" rel="noopener noreferrer">
              <img src={hoseo} alt='hoseoLogo' />
            </a>
          </div>
        </div>

        {/* 상단 텍스트 */}
        <div className="home-header-margin-left">
          <h1>함께 하면 완벽한 코드<br />를 작성할 수 있어요.</h1>
          <p>
            아이디어를 모으고, 팀원들의 피드백을 받으세요.
          </p>
        </div>
        <div className="home-header-margin-right">
          <p>실시간 협업</p>
          <p>아이디어의 시너지</p>
        </div>

        {/* 큰 이미지 섹션 */}
        <div className="home-large-image-space">
          <img src={pic1} alt='pic1' className='home-image2' />
        </div>

        {/* 상단 텍스트 */}
        <div className="home-header-margin-left">
          <h1>같이 만들고,<br />같이 성장하세요.</h1>
          <p>
            모두의 노력이 더 큰 성공으로 이어집니다.
          </p>
        </div>
        <div className="home-header-margin-right">
          <p>성장의 여정</p>
          <p>협력의 가치</p>
        </div>

        {/* 큰 이미지 섹션 */}
        <div className="home-large-image-space">
          <img src={pic3} alt='pic3' className='home-image3' />
        </div>

        {/* 상단 텍스트 */}
        <div className="home-header-margin-left">
          <h1>코드로 연결되는<br />협업의 즐거움.</h1>
          <p>
            실시간으로 소통하며 창의적인 결과물을<br />만들어 보세요.
          </p>
        </div>
        <div className="home-header-margin-right">
          <p>소통의 힘</p>
          <p>창의적 시너지</p>
        </div>

        {/* 큰 이미지 섹션 */}
        <div className="home-large-image-space">
          <img src={pic4} alt='pic4' className='home-image4' />
        </div>

        {/* 상단 텍스트 */}
        <div className="home-header-margin-left">
          <h1>거리와 상관없는 협업,<br />LiveCodeSpace.</h1>
          <p>
            실시간으로 협력하며 팀의 가능성을 새로운<br />차원으로 끌어올리세요.
          </p>
        </div>
        <div className="home-header-margin-right">
          <p>경계를 넘는 협업</p>
          <p>무한한 가능성</p>
        </div>

        {/* 큰 이미지 섹션 */}
        <div className="home-large-image-space">
        <img src={pic5} alt='pic5' className='home-image5' />
        </div>

        <div className='home-footer'>
          <div className="footer-content">
            <div className="footer-section">
              <h3>LiveCodeSpace</h3>
              <p>실시간 협업 코딩 플랫폼</p>
              <p>© 2024 LiveCodeSpace. All rights reserved.</p>
            </div>
            <div className="footer-section">
              <h4>제품</h4>
              <ul>
                <li>실시간 코딩</li>
                <li>팀 협업</li>
                <li>코드 리뷰</li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>리소스</h4>
              <ul>
                <li>도움말</li>
                <li>문서</li>
                <li>커뮤니티</li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>문의</h4>
              <ul>
                <li>이메일: contact@livecode.space</li>
                <li>전화: 041-123-4567</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;