import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const NewProject = () => {
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleCreateProject = async () => {
    const token = localStorage.getItem("token");
  
    if (!token) {
      setError("You need to log in to create a project.");
      return;
    }
  
    if (!projectName.trim()) {
      setError("Project name cannot be empty.");
      return;
    }
  
    try {
      const response = await fetch(`${process.env.REACT_APP_PROJECTS_API_URL}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectName }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        navigate(`/workspace/${data.project.projectId}`);
      } else {
        setError(data.error || "Failed to create project.");
      }
    } catch (err) {
      setError("An error occurred while creating the project.");
    }
  };

  return (
    <div>
      <h1>Create New Project</h1>
      <input
        type="text"
        placeholder="Enter project name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={{ marginBottom: "10px" }}
      />
      <button onClick={handleCreateProject}>Create Project</button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default NewProject;