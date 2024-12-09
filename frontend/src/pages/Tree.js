import React, { useState } from "react";
import "../styles/Tree.css"; // 트리 스타일

const [tree, setTree] = useState([]); // 초기 상태를 빈 배열로 설정

const TreeNode = ({ node, onFolderClick, onFileClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    if (node.type === "folder") {
      setIsExpanded(!isExpanded);
      onFolderClick(node);
    } else if (node.type === "file") {
      onFileClick(node);
    }
  };

  return (
    <div className={`tree-node ${node.type}`}>
      <div
        className={`tree-label ${isExpanded ? "expanded" : ""}`}
        onClick={handleToggle}
      >
        {node.type === "folder" ? (
          <span className="folder-icon">{isExpanded ? "📂" : "📁"}</span>
        ) : (
          <span className="file-icon">📄</span>
        )}
        {node.name}
      </div>
      {isExpanded && node.children && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onFolderClick={onFolderClick}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Tree = ({ data, onFolderClick, onFileClick }) => {
  if (!data || data.length === 0) {
    return <p>No files or folders available.</p>; // 트리가 비어있을 때 메시지 표시
  }

  return (
    <ul>
      {data.map((node) => (
        <li key={node.id}>
          {node.type === "folder" ? (
            <div onClick={() => onFolderClick(node)}>
              <strong>{node.name}</strong>
            </div>
          ) : (
            <div onClick={() => onFileClick(node)}>{node.name}</div>
          )}
        </li>
      ))}
    </ul>
  );
};

export default Tree;