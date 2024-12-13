import React from "react";
import { useNavigate } from "react-router-dom";

const ProjectList = ({ projects }) => {
  const navigate = useNavigate();

  return (
    <div className="project-list">
      <h2>Your Projects</h2>
      <ul>
        {projects.map((project) => (
          <li
            key={project.id}
            onClick={() => navigate(`/workspace/${project.id}`)}
          >
            {project.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProjectList;