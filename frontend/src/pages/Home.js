import React from 'react';
import '../styles/Home.css';
import Header from './Header.js';
import hoseo from '../img/호서.webp';

const Home = () => {
  return (
    <div>
      <Header />
    <div className="home-container">
      {/* 상단 텍스트와 이미지 */}
      <div className="home-header-with-image">
        <div className="home-header">
          <h1>아름다운 결<br/>과물을 만들<br/>어 내세요.</h1>
          <p>
            LiveCodeSpace와 함께하면 팀의 생산성은 향상되고 마음<br/>
            에는 평화가 찾아옵니다.
          </p>
          <button
            className="home-primary-button"
            onClick={() => (window.location.href = '/login')}
          >
            LiveCodeSpace 무료로 사용하기
          </button>
        </div>
        <div className="home-header-image">
          <img src="" alt="Sample Visual" />
        </div>
      </div>

      <div className="home-partners">
        <p>LiveCodeSpace를 사용하는 파트너</p>
        <div className="home-partner-logos">
          <img src={hoseo} alt='hoseoLogo'/>
        </div>
      </div>

      <div className="home-large-image-space">
        {/* 큰 이미지를 추가할 수 있는 공간 */}
      </div>

      {/* 상단 텍스트 */}
      <div className="home-header-margin-left">
        <h1>함께 하면 완벽한 코드<br/>를 작성할 수 있어요.</h1>
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
        {/* 큰 이미지를 추가할 수 있는 공간 */}
      </div>

      {/* 상단 텍스트 */}
      <div className="home-header-margin-left">
        <h1>같이 만들고,<br/>같이 성장하세요.</h1>
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
        {/* 큰 이미지를 추가할 수 있는 공간 */}
      </div>

      {/* 상단 텍스트 */}
      <div className="home-header-margin-left">
        <h1>코드로 연결되는<br/>협업의 즐거움.</h1>
        <p>
          실시간으로 소통하며 창의적인 결과물을<br/>만들어 보세요.
        </p>
      </div>
      <div className="home-header-margin-right">
        <p>소통의 힘</p>
        <p>창의적 시너지</p>
      </div>
      
      {/* 큰 이미지 섹션 */}
      <div className="home-large-image-space">
        {/* 큰 이미지를 추가할 수 있는 공간 */}
      </div>

      {/* 상단 텍스트 */}
      <div className="home-header-margin-left">
        <h1>거리와 상관없는 협업,<br/>LiveCodeSpace.</h1>
        <p>
          실시간으로 협력하며 팀의 가능성을 새로운<br/>차원으로 끌어올리세요.
        </p>
      </div>
      <div className="home-header-margin-right">
        <p>경계를 넘는 협업</p>
        <p>무한한 가능성</p>
      </div>
      
      {/* 큰 이미지 섹션 */}
      <div className="home-large-image-space">
        {/* 큰 이미지를 추가할 수 있는 공간 */}
      </div>

      <div className='home-footer'>

      </div>
    </div>
    </div>
  );
};

export default Home;