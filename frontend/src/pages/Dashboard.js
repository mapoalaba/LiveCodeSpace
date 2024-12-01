// 사용자 프로젝트 대시보드

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const [projects, setProjects] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProjects = async () => {
      const token = localStorage.getItem("token");
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        setProjects(data);
      } catch (error) {
        console.error("Failed to fetch projects:", error);
      }
    };

    fetchProjects();
  }, []);

  const createNewProject = () => navigate("/new-project");
  const openProject = (projectId) => navigate(`/workspace/${projectId}`);

  return (
    <div>
      <h1>Your Projects</h1>
      <button onClick={createNewProject}>Create New Project</button>
      <ul>
        {projects.map((project) => (
          <li key={project.projectId}>
            {project.projectName}
            <button onClick={() => openProject(project.projectId)}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Dashboard;