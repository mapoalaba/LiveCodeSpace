import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import '../styles/Dashboard.css';
import bin from '../img/쓰레기통.png';

const Dashboard = () => {
  const [projects, setProjects] = useState([]); // 사용자 프로젝트 리스트 상태
  const [loading, setLoading] = useState(true); // 로딩 상태
  const [error, setError] = useState(""); // 에러 메시지
  const navigate = useNavigate();

  // 사용자 프로젝트 리스트 가져오기
  const fetchProjects = async () => {
    const token = localStorage.getItem("token");
    setLoading(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("프로젝트 목록을 불러오는 데 실패했습니다.");
      }

      const data = await response.json();
      setProjects(data); // 프로젝트 리스트 업데이트
    } catch (err) {
      console.error("프로젝트 불러오기 오류:", err.message);
      setError("프로젝트를 불러올 수 없습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  // 새 프로젝트 생성
  const createNewProject = async () => {
    const projectName = prompt("새 프로젝트 이름을 입력하세요:");
    if (!projectName) return;

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectName }),
      });

      if (!response.ok) {
        throw new Error("새 프로젝트 생성에 실패했습니다.");
      }

      const data = await response.json();
      setProjects((prevProjects) => [...prevProjects, data.project]); // 리스트에 새 프로젝트 추가
    } catch (err) {
      console.error("새 프로젝트 생성 오류:", err.message);
      setError("프로젝트를 생성할 수 없습니다. 다시 시도해주세요.");
    }
  };

  // 프로젝트 삭제 함수 수정
  const deleteProject = async (projectId) => {
    if (!window.confirm('정말로 이 프로젝트를 삭제하시겠습니까?')) {
      return;
    }

    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROJECTS_API_URL}/${projectId}`, 
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("프로젝트 삭제에 실패했습니다.");
      }

      const data = await response.json();
      alert(data.message); // 성공 메시지 알림창 표시

      // 프로젝트 목록에서 삭제된 프로젝트 제거
      setProjects((prevProjects) => 
        prevProjects.filter((project) => project.projectId !== projectId)
      );
    } catch (err) {
      console.error("프로젝트 삭제 오류:", err.message);
      setError("프로젝트를 삭제할 수 없습니다.");
    }
  };

  // 특정 프로젝트로 이동
  const openProject = (projectId) => {
    navigate(`/workspace/${projectId}`);
  };

  // 첫 로드 시 프로젝트 목록 가져오기
  useEffect(() => {
    // 토큰 체크
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    fetchProjects();
  }, []);

  return (
    <div className="project-dashboard">
      <h1>내 프로젝트</h1>
      <button onClick={createNewProject}>새 프로젝트 만들기</button>
      {loading ? (
        <p>프로젝트를 불러오는 중...</p>
      ) : error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.projectId}>
              <span className="project-name" title={project.projectName}>
                {project.projectName}
              </span>
              <div className="button-group">
                <button onClick={() => openProject(project.projectId)}>열기</button>
                <img 
                  src={bin}
                  alt="삭제"
                  className="delete-icon"
                  onClick={() => deleteProject(project.projectId)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


export default Dashboard;