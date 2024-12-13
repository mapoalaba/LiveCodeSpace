import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import '../styles/Dashboard.css';
import bin from '../img/쓰레기통.png';
import user from '../img/user.png';

const Dashboard = () => {
  const [projects, setProjects] = useState([]); // 사용자 프로젝트 리스트 상태
  const [invitedProjects, setInvitedProjects] = useState([]); // 초대받은 프로젝트
  const [loading, setLoading] = useState(true); // 로딩 상태
  const [error, setError] = useState(""); // 에러 메시지
  const navigate = useNavigate();
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedProjectMembers, setSelectedProjectMembers] = useState([]);
  const [selectedProjectName, setSelectedProjectName] = useState("");

  // 사용자 프로젝트 리스트 가져오기
  const fetchProjects = async () => {
    console.log("1. fetchProjects 시작");
    const token = localStorage.getItem("token");
    console.log("2. 토큰 확인:", token ? "토큰 있음" : "토큰 없음");

    if (!token) {
      setError("인증 토큰이 없습니다. 다시 로그인해주세요.");
      navigate('/login');
      return;
    }

    setLoading(true);
    setError("");

    try {
      console.log("3. API 요청 시작:", process.env.REACT_APP_PROJECTS_API_URL);
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      });

      console.log("4. API 응답 상태:", response.status);
      const responseData = await response.json();
      console.log("5. API 응답 데이터:", responseData);

      if (!response.ok) {
        throw new Error(responseData.error || "서버에서 응답을 받지 못했습니다.");
      }

      setProjects(Array.isArray(responseData) ? responseData : []);
      console.log("6. 상태 업데이트 완료");
    } catch (err) {
      console.error("7. 에러 발생:", {
        message: err.message,
        stack: err.stack
      });
      setError(err.message || "프로젝트를 불러올 수 없습니다.");
      if (err.message.includes('인증')) {
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  // 새 프로젝트 생성 함수 수정
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
      // 새 프로젝트에 owner 역할 추가
      const newProject = {
        ...data.project,
        role: 'owner'  // 생성자는 항상 owner
      };
      setProjects((prevProjects) => [...prevProjects, newProject]);
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

  // 프로젝트 초대 함수
  const inviteToProject = async (projectId) => {
    const email = prompt("초대할 사용자의 이메일을 입력하세요:");
    if (!email) return;

    try {
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}/${projectId}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (response.ok) {
        alert("초대를 보냈습니다.");
      } else {
        alert(data.error || "존재하지 않는 사용자입니다.");
      }
    } catch (error) {
      console.error("초대 오류:", error);
      alert("초대 처리 중 오류가 발생했습니다.");
    }
  };

  // 초대 수락 함수 수정
  const acceptInvitation = async (projectId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}/${projectId}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("초대 수락에 실패했습니다.");
      }

      const data = await response.json();
      
      // 초대 목록에서 제거
      setInvitedProjects(prev => prev.filter(p => p.projectId !== projectId));
      
      // 프로젝트 목록에 새로 추가
      if (data.project) {
        setProjects(prev => [...prev, data.project]);
      }

      // 성공 메시지 표시
      alert("프로젝트 초대가 수락되었습니다.");
      
    } catch (error) {
      console.error("초대 수락 오류:", error);
      alert("초대 수락 중 오류가 발생했습니다.");
    }
  };

  // 특정 프로젝트로 이동
  const openProject = (projectId) => {
    navigate(`/workspace/${projectId}`);
  };

  // 첫 로드 시 프로젝트 목록 가져오기
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    // 프로젝트 목록과 초대 목록을 별도로 가져오기
    fetchProjects();
    fetchInvitations();
  }, [navigate]); // Promise.all 제거하고 각각 호출

  // 초대 목록 가져오기 
  const fetchInvitations = async () => {
    try {
      console.log("1. 초대 목록 조회 시작");
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}/invitations`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      
      console.log("2. 응답 상태:", response.status);
      if (!response.ok) {
        throw new Error("초대 목록 조회 실패");
      }

      const data = await response.json();
      console.log("3. 초대 응답 데이터:", data);
      
      // 초대 목록만 설정 (프로젝트 목록과 구분)
      if (Array.isArray(data)) {
        setInvitedProjects(data);
      }
    } catch (error) {
      console.error("초대 목록 조회 오류:", error);
      setInvitedProjects([]);
    }
  };

  // 프로젝트 멤버 조회 함수
  const fetchProjectMembers = async (projectId, projectName) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROJECTS_API_URL}/${projectId}/members`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("멤버 목록을 가져오는데 실패했습니다.");
      }

      const data = await response.json();
      setSelectedProjectMembers(data);
      setSelectedProjectName(projectName);
      setShowMembersModal(true);
    } catch (error) {
      console.error("멤버 조회 실패:", error);
      alert("멤버 목록을 가져오는데 실패했습니다.");
    }
  };

  // 프로젝트 멤버 삭제 함수 추가
  const removeMember = async (projectId, memberUserId) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_PROJECTS_API_URL}/${projectId}/members/${memberUserId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("멤버 삭제에 실패했습니다.");
      }

      // 멤버 목록 업데이트
      setSelectedProjectMembers(prevMembers => 
        prevMembers.filter(member => member.userId !== memberUserId)
      );

      // 성공 메시지 표시
      alert("멤버가 성공적으로 삭제되었습니다.");
    } catch (error) {
      console.error("멤버 삭제 오류:", error);
      alert("멤버 삭제에 실패했습니다.");
    }
  };

  // 멤버 목록 Modal 컴포넌트
  const MembersModal = () => {
    if (!showMembersModal) return null;

    // 현재 프로젝트에서 사용자의 역할 확인
    const currentProject = projects.find(p => p.projectName === selectedProjectName);
    const isOwner = currentProject?.role === 'owner';

    return (
      <div className="modal-backdrop" onClick={() => setShowMembersModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">{selectedProjectName} 멤버 목록</h2>
            <button 
              className="close-button"
              onClick={() => setShowMembersModal(false)}
            >
              ×
            </button>
          </div>
          <ul className="members-list">
            {selectedProjectMembers.map((member) => (
              <li key={member.userId} className="member-item">
                <span className="member-email">{member.email}</span>
                <div className="member-actions">
                  <span className={`member-role role-${member.role}`}>
                    {member.role === 'owner' ? '소유자' : '멤버'}
                  </span>
                  {isOwner && member.role === 'member' && (
                    <img
                      src={bin}
                      alt="멤버 삭제"
                      className="delete-icon"
                      onClick={() => {
                        if (window.confirm(`${member.email}을(를) 프로젝트에서 삭제하시겠습니까?`)) {
                          removeMember(currentProject.projectId, member.userId);
                        }
                      }}
                      style={{ marginLeft: '10px', width: '20px', height: '20px' }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="project-dashboard">
      {invitedProjects.length > 0 && (
        <>
          <h2>초대받은 프로젝트</h2>
          <ul>
            {invitedProjects.map((project) => (
              <li key={project.projectId}>
                <span className="project-name" title={project.projectName}>
                  {project.projectName}
                </span>
                <button onClick={() => acceptInvitation(project.projectId)}>
                  수락
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

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
                {/* owner인 경우에만 초대와 삭제 버튼 표시 */}
                {project.role === 'owner' && (
                  <>
                    <button 
                      className="invite-button"
                      onClick={() => inviteToProject(project.projectId)}
                      style={{ backgroundColor: '#4CAF50', color: 'white' }}
                    >
                      초대
                    </button>
                  </>
                )}
                <img 
                  src={user}
                  alt="멤버 보기"
                  className="user-icon"
                  onClick={() => fetchProjectMembers(project.projectId, project.projectName)}
                />
                {project.role === 'owner' && (
                  <img 
                    src={bin}
                    alt="삭제"
                    className="delete-icon"
                    onClick={() => deleteProject(project.projectId)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <MembersModal />
    </div>
  );
};

export default Dashboard;