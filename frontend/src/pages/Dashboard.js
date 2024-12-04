import React, { useState } from 'react';
import '../styles/Dashboard.css';

function Dashboard() {
  const [projects, setProjects] = useState([
    { id: 1, title: '프로젝트 1', description: '진행중인 프로젝트', progress: 75 },
    { id: 2, title: '프로젝트 2', description: '신규 프로젝트', progress: 20 },
  ]);

  const handleNewProject = () => {
    // 새 프로젝트 생성 로직
    console.log('새 프로젝트 생성');
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>나의 프로젝트</h1>
        <button className="new-project-btn" onClick={handleNewProject}>
          + 새 프로젝트 만들기
        </button>
      </header>

      <div className="projects-grid">
        {projects.map(project => (
          <div key={project.id} className="project-card">
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${project.progress}%` }}
              ></div>
            </div>
            <span className="progress-text">{project.progress}% 완료</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;