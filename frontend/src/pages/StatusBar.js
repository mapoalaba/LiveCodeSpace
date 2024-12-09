import React from "react";
import "../styles/Workspace.css";

const StatusBar = () => {
  return (
    <div className="statusbar">
      <span>Ready</span>
      <span>Branch: main</span>
      <span>User: Admin</span>
    </div>
  );
};

export default StatusBar;