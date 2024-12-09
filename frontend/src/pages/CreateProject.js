import React, { useState } from "react";

const CreateProject = ({ onCreate }) => {
  const [projectName, setProjectName] = useState("");

  const handleCreate = async () => {
    if (!projectName.trim()) {
      alert("Please enter a valid project name!");
      return;
    }

    try {
      const response = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create project: ${response.statusText}`);
      }

      const newProject = await response.json();
      onCreate(newProject); // 부모 컴포넌트에 새 프로젝트 추가
      setProjectName(""); // 입력 필드 초기화
    } catch (error) {
      console.error("Error creating project:", error);
      alert("Failed to create project. Please try again later.");
    }
  };

  return (
    <div className="create-project">
      <h2>Create New Project</h2>
      <input
        type="text"
        placeholder="Enter project name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
      />
      <button onClick={handleCreate}>Create Project</button>
    </div>
  );
};

export default CreateProject;