import React from "react";
import "../styles/Sidebar.css";

const Sidebar = ({ tree, onFolderClick, onFileClick, onCreateFolder, onCreateFile }) => {
  if (!tree || tree.length === 0) {
    return <p>No files or folders available.</p>;
  }

  return (
    <div className="sidebar">
      <div className="sidebar-controls">
        <button onClick={onCreateFolder}>+ 폴더</button>
        <button onClick={onCreateFile}>+ 파일</button>
      </div>
      <ul>
        {tree.map((node) => (
          <li key={node.id}>
            {node.type === "folder" ? (
              <div onClick={() => onFolderClick(node)}>{node.name}</div>
            ) : (
              <div onClick={() => onFileClick(node)}>{node.name}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Sidebar;