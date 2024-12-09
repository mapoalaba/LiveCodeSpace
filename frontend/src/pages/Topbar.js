import React from "react";
import "../styles/Workspace.css";

const Topbar = ({ currentFile }) => {
  return (
    <div className="topbar">
      <span>{currentFile || "Untitled"}</span>
    </div>
  );
};

export default Topbar;