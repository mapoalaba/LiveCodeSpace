// 협업 작업 공간

import React from "react";
import { useParams } from "react-router-dom";

const Workspace = () => {
  const { projectId } = useParams();

  return (
    <div>
      <h1>Workspace</h1>
      <p>Project ID: {projectId}</p>
      <p>Start collaborating on your project here!</p>
    </div>
  );
};

export default Workspace;