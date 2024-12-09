import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Editor } from "@monaco-editor/react";
import axios from "axios";
import "../styles/Workspace.css";

const Workspace = () => {
  const { projectId } = useParams();
  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [currentFolder, setCurrentFolder] = useState("");
  const [currentFile, setCurrentFile] = useState("");
  const [fileContent, setFileContent] = useState("// 코드를 작성하세요!");
  const [loading, setLoading] = useState(false);

  const fetchFileTree = async (parentId = 'root') => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/items?parentId=${parentId === 'root' ? '' : parentId}`,
        {
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

  const handleFolderClick = async (folder) => {
    const newExpandedFolders = new Set(expandedFolders);
    const isExpanded = expandedFolders.has(folder.id);
  
    try {
      if (isExpanded) {
        // 폴더를 닫을 때
        newExpandedFolders.delete(folder.id);
        // 상위 폴더의 ID로 currentFolder 변경
        setCurrentFolder(folder.parentId || "");  // 루트 폴더의 경우 빈 문자열
      } else {
        // 폴더를 열 때
        newExpandedFolders.add(folder.id);
        const token = localStorage.getItem("token");
        
        const response = await fetch(
          `http://localhost:5001/api/filesystem/${projectId}/items?parentId=${folder.id}`,
          {
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
        // 현재 폴더를 클릭한 폴더로 설정
        setCurrentFolder(folder.id);
      }
      
      setExpandedFolders(newExpandedFolders);
    } catch (error) {
      console.error("폴더 내용 가져오기 실패:", error);
      alert("폴더 내용을 가져오는데 실패했습니다.");
    }
  };

  const handleFileClick = (file) => {
    if (!file || !file.id) {
      console.error("파일 데이터가 유효하지 않습니다:", file);
      return;
    }
    fetchFileContent(file);
  };

  const fetchFileContent = async (file) => {
    if (!file || !file.id) return;
  
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
      setCurrentFile(file.id);
    } catch (error) {
      console.error("파일 내용 가져오기 중 오류:", error.message);
    } finally {
      setLoading(false);
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
          body: JSON.stringify({ content: fileContent }),
        }
      );
  
      if (!response.ok) throw new Error("파일 내용을 저장하지 못했습니다.");
      console.log("파일이 성공적으로 저장되었습니다!");
    } catch (error) {
      console.error("파일 저장 중 오류:", error);
      alert("파일 저장에 실패했습니다.");
    }
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
            parentId: currentFolder || ""
          }),
        }
      );
  
      if (!response.ok) {
        throw new Error("폴더 생성에 실패했습니다.");
      }
  
      const createdItem = await response.json();
      console.log("생성된 폴더:", createdItem);
  
      // fetchFileTree 대신 직접 상태 업데이트
      if (!currentFolder) {
        // 루트 디렉토리인 경우
        setFileTree(prevTree => {
          // 중복 체크
          const exists = prevTree.some(item => item.id === createdItem.id);
          if (exists) return prevTree;
          return [...prevTree, createdItem];
        });
      } else {
        // 하위 폴더인 경우
        setFileTree(prevTree => 
          prevTree.map(node => {
            if (node.id === currentFolder) {
              // 중복 체크
              const children = node.children || [];
              const exists = children.some(item => item.id === createdItem.id);
              if (exists) return node;
              return {
                ...node,
                children: [...children, createdItem]
              };
            }
            return node;
          })
        );
      }
    } catch (error) {
      console.error("폴더 생성 중 오류:", error);
      alert("폴더 생성에 실패했습니다.");
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
            parentId: currentFolder || ""
          }),
        }
      );
  
      if (!response.ok) {
        throw new Error("파일 생성에 실패했습니다.");
      }
  
      const createdItem = await response.json();
      console.log("생성된 파일:", createdItem);
  
      // fetchFileTree 대신 직접 상태 업데이트
      if (!currentFolder) {
        // 루트 디렉토리인 경우
        setFileTree(prevTree => {
          // 중복 체크
          const exists = prevTree.some(item => item.id === createdItem.id);
          if (exists) return prevTree;
          return [...prevTree, createdItem];
        });
      } else {
        // 하위 폴더인 경우
        setFileTree(prevTree => 
          prevTree.map(node => {
            if (node.id === currentFolder) {
              // 중복 체크
              const children = node.children || [];
              const exists = children.some(item => item.id === createdItem.id);
              if (exists) return node;
              return {
                ...node,
                children: [...children, createdItem]
              };
            }
            return node;
          })
        );
      }
    } catch (error) {
      console.error("파일 생성 중 오류:", error);
      alert("파일 생성에 실패했습니다.");
    }
  };

  const handleDelete = async (node) => {
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `${node.type === 'folder' ? '폴더' : '파일'} 삭제에 실패했습니다.`);
      }
  
      // 파일 트리 상태 업데이트
      setFileTree(prevTree => {
        // 루트 레벨의 아이템 삭제인 경우
        if (!node.parentId || node.parentId === "") {
          return prevTree.filter(item => item.id !== node.id);
        }
  
        // 하위 아이템 삭제인 경우
        return prevTree.map(item => {
          if (item.id === node.parentId && item.children) {
            return {
              ...item,
              children: item.children.filter(child => child.id !== node.id)
            };
          } else if (item.type === 'folder' && item.children) {
            return {
              ...item,
              children: updateTreeAfterDelete(item.children, node.id)
            };
          }
          return item;
        });
      });
  
      // 삭제된 파일이 현재 열린 파일이면 에디터 초기화
      if (node.type === 'file' && node.id === currentFile) {
        setCurrentFile("");
        setFileContent("// 코드를 작성하세요!");
      }
  
    } catch (error) {
      console.error('Delete failed:', error);
      alert(error.message);
    }
  };

  // 재귀적으로 트리를 순회하며 삭제된 아이템 제거
const updateTreeAfterDelete = (children, deletedId) => {
  return children
    .filter(child => child.id !== deletedId)
    .map(child => {
      if (child.type === 'folder' && child.children) {
        return {
          ...child,
          children: updateTreeAfterDelete(child.children, deletedId)
        };
      }
      return child;
    });
};

  const handleRename = async (node, e) => {
    e.stopPropagation();
    const newName = prompt(
      `새로운 ${node.type === 'folder' ? '폴더' : '파일'} 이름을 입력하세요:`,
      node.name
    );
    
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
          body: JSON.stringify({ newName }),
        }
      );
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "이름 변경에 실패했습니다.");
      }
  
      const data = await response.json();
      
      // 파일 트리 상태 업데이트
      setFileTree(prevTree => {
        const updateNode = (nodes) => {
          return nodes.map(n => {
            if (n.id === node.id) {
              // 현재 노드 업데이트
              return {
                ...n,
                name: newName,
                path: data.updatedItem.path
              };
            } else if (n.type === 'folder' && n.children) {
              // 하위 항목 재귀적으로 처리
              return {
                ...n,
                children: updateNode(n.children)
              };
            }
            return n;
          });
        };
  
        // 현재 폴더의 내용이 제공된 경우 사용
        if (data.updatedItems && node.parentId === currentFolder) {
          return data.updatedItems;
        }
        
        return updateNode(prevTree);
      });
  
      // 현재 파일인 경우 현재 파일 이름 업데이트
      if (node.id === currentFile) {
        setCurrentFile(data.updatedItem.id);
      }
  
    } catch (error) {
      console.error("이름 변경 중 오류:", error);
      alert(error.message);
    }
  };

  const FileTreeNode = ({ node, level = 0 }) => {
    const isExpanded = expandedFolders.has(node.id);
    const indent = level * 20;

    const handleDeleteClick = (e) => {
      e.stopPropagation();
      const isConfirmed = window.confirm(
        `정말로 이 ${node.type === 'folder' ? '폴더' : '파일'}를 삭제하시겠습니까?`
      );
    
      if (isConfirmed) {
        handleDelete(node);
      }
    };
  
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
              onClick={(e) => handleRename(node, e)}
              className="action-button rename-button"
              title={`${node.type === 'folder' ? '폴더' : '파일'} 이름 변경`}
            >
              ✏️
            </button>
            <button 
              onClick={handleDeleteClick}
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

  useEffect(() => {
    fetchFileTree();
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