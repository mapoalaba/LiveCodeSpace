import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Editor } from "@monaco-editor/react";
import "../styles/Workspace.css";

const Workspace = () => {
  const { projectId } = useParams();
  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [currentFolder, setCurrentFolder] = useState("");
  const [currentFile, setCurrentFile] = useState("");
  const [fileContent, setFileContent] = useState("// 코드를 작성하세요!");
  const [loading, setLoading] = useState(false);

  const handleFolderClick = async (folder) => {
    const newExpandedFolders = new Set(expandedFolders);
    const isExpanded = expandedFolders.has(folder.id);  // folder.path 대신 folder.id 사용
  
    try {
      if (isExpanded) {
        newExpandedFolders.delete(folder.id);
      } else {
        newExpandedFolders.add(folder.id);
        const token = localStorage.getItem("token");
        
        const response = await fetch(
          `http://localhost:5001/api/filesystem/${projectId}/items?parentId=${folder.id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
  
        if (!response.ok) {
          throw new Error("폴더 내용을 가져오는데 실패했습니다.");
        }
  
        const data = await response.json();
        setFileTree(prevTree => updateTreeNode(prevTree, folder.id, data.items || []));
      }
      
      setExpandedFolders(newExpandedFolders);
      setCurrentFolder(folder.id);
    } catch (error) {
      console.error("폴더 내용 가져오기 실패:", error);
      alert("폴더 내용을 가져오는데 실패했습니다.");
    }
  };

  const FileTreeNode = ({ node, level = 0 }) => {
    const isExpanded = expandedFolders.has(node.id);
  
    const handleDelete = async (e) => {
      e.stopPropagation();
      const isConfirmed = window.confirm(
        `정말로 이 ${node.type === 'folder' ? '폴더' : '파일'}를 삭제하시겠습니까?`
      );
  
      if (!isConfirmed) return;
  
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `http://localhost:5001/api/filesystem/items/${node.id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            }
          }
        );
  
        if (!response.ok) {
          throw new Error(`${node.type === 'folder' ? '폴더' : '파일'} 삭제에 실패했습니다.`);
        }
  
        await fetchFileTree(currentFolder);
        
        if (node.type === 'file' && node.id === currentFile) {
          setCurrentFile("");
          setFileContent("// 코드를 작성하세요!");
        }
      } catch (error) {
        console.error("삭제 중 오류:", error);
        alert(error.message);
      }
    };

    const handleRename = async (e) => {
      e.stopPropagation();
      const newName = prompt(`새로운 ${node.type === 'folder' ? '폴더' : '파일'} 이름을 입력하세요:`, node.name);
      
      if (!newName || newName === node.name) return;
    
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(
          `http://localhost:5001/api/filesystem/items/${node.id}/rename`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              newName
            }),
          }
        );
    
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "이름 변경에 실패했습니다.");
        }
    
        await fetchFileTree(currentFolder);
      } catch (error) {
        console.error("이름 변경 중 오류:", error);
        alert(error.message);
      }
    };
  
    const indent = level * 20;
  
    return (
      <li className={node.type} style={{ marginLeft: `${indent}px` }}>
        <div className="tree-node-container">
          <div 
            onClick={() => node.type === 'folder' ? handleFolderClick(node) : handleFileClick(node)}
            className={`tree-node ${node.type} ${isExpanded ? 'expanded' : ''}`}
          >
            <span className="icon">
              {node.type === 'folder' ? (isExpanded ? '📂' : '📁') : '📄'}
            </span>
            <span className="name">{node.name}</span>
          </div>
          <div className="tree-node-actions">
            <button 
              onClick={handleRename}
              className="action-button rename-button"
              title={`${node.type === 'folder' ? '폴더' : '파일'} 이름 변경`}
            >
              ✏️
            </button>
            <button 
              onClick={handleDelete}
              className="action-button delete-button"
              title={`${node.type === 'folder' ? '폴더' : '파일'} 삭제`}
            >
              🗑️
            </button>
          </div>
        </div>
        {node.type === "folder" && isExpanded && node.children && (
          <ul style={{ listStyle: 'none', paddingLeft: '0' }}>
            {node.children.map(child => (
              <FileTreeNode 
                key={child.id} 
                node={child} 
                level={level + 1}
              />
            ))}
          </ul>
        )}
      </li>
    );
  };

  const fetchFileTree = async (parentId = 'root') => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/items?parentId=${parentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) throw new Error("파일 트리 가져오기에 실패했습니다.");

      const data = await response.json();
      
      if (parentId !== 'root') {
        setFileTree(prevTree => updateTreeNode(prevTree, parentId, data.items));
      } else {
        setFileTree(data.items || []);
      }
    } catch (error) {
      console.error("파일 트리 가져오기 중 오류:", error.message);
    }
  };

  const updateTreeNode = (tree, nodeId, newChildren) => {
    return tree.map(node => {
      if (node.id === nodeId) {
        return { ...node, children: newChildren };
      } else if (node.type === "folder" && node.children) {
        return {
          ...node,
          children: updateTreeNode(node.children, nodeId, newChildren)
        };
      }
      return node;
    });
  };

  const fetchFileContent = async (file) => {
    if (!file || !file.id || !file.path) {
      console.error("파일 데이터가 유효하지 않습니다:", file);
      return;
    }
  
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("토큰이 없습니다. 로그인이 필요합니다.");
      return;
    }
  
    setLoading(true);
    try {
      const response = await fetch(
        `http://localhost:5001/api/filesystem/items/${file.id}/content`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
  
      if (!response.ok) {
        throw new Error("파일 내용을 가져오지 못했습니다.");
      }
  
      const data = await response.json();
      setFileContent(data.content || "");
      setCurrentFile(file.id); // path 대신 id 사용
    } catch (error) {
      console.error("파일 내용 가져오기 중 오류:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = (file) => {
    if (!file || !file.id) {
      console.error("파일 데이터가 유효하지 않습니다:", file);
      return;
    }
    fetchFileContent(file);
  };

  const handleCreateFolder = async () => {
    const folderName = prompt("새 폴더 이름을 입력하세요:");
    if (!folderName) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: folderName,
            type: "folder",
            parentId: currentFolder
          }),
        }
      );

      if (!response.ok) {
        throw new Error("폴더 생성에 실패했습니다.");
      }

      await fetchFileTree(currentFolder);
    } catch (error) {
      console.error("폴더 생성 중 오류:", error.message);
    }
  };

  const handleCreateFile = async () => {
    const fileName = prompt("새 파일 이름을 입력하세요:");
    if (!fileName) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/items`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: fileName,
            type: "file",
            parentId: currentFolder
          }),
        }
      );

      if (!response.ok) {
        throw new Error("파일 생성에 실패했습니다.");
      }

      await fetchFileTree(currentFolder);
    } catch (error) {
      console.error("파일 생성 중 오류:", error.message);
    }
  };

  const saveFileContent = async () => {
    if (!currentFile) return;
  
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/items/${currentFile}/content`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: fileContent,
          }),
        }
      );
  
      if (!response.ok) throw new Error("파일 내용을 저장하지 못했습니다.");
      console.log("파일이 성공적으로 저장되었습니다!");
    } catch (error) {
      console.error("파일 저장 중 오류:", error);
      alert("파일 저장에 실패했습니다.");
    }
  };

  useEffect(() => {
    fetchFileTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="workspace">
      <div className="sidebar">
        <div className="sidebar-header">
          <button onClick={handleCreateFolder}>+ 폴더</button>
          <button onClick={handleCreateFile}>+ 파일</button>
        </div>
        <ul className="file-tree" style={{ listStyle: 'none', padding: '0' }}>
          {fileTree.map(node => (
            <FileTreeNode key={node.id} node={node} />
          ))}
        </ul>
      </div>

      <div className="editor">
        <div className="editor-header">
          <span>현재 폴더: {currentFolder || "루트 디렉토리"}</span>
          <span>{currentFile || "파일을 선택하세요"}</span>
          <button onClick={saveFileContent}>저장</button>
        </div>
        {loading ? (
          <p>파일 로드 중...</p>
        ) : (
          <Editor
            height="calc(100vh - 50px)"
            defaultLanguage={currentFile.split(".").pop()}
            value={fileContent}
            theme="vs-dark"
            onChange={(newValue) => setFileContent(newValue)}
          />
        )}
      </div>
    </div>
  );
};

export default Workspace;