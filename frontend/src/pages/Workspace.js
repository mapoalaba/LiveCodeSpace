import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Editor } from "@monaco-editor/react";
import { Icon } from '@mdi/react';
import { 
  mdiLanguageJavascript,
  mdiReact,
  mdiCodeJson,
  mdiLanguageMarkdown,
  mdiLanguageCss3,
  mdiLanguageHtml5,
  mdiConsole,
  mdiCog,
  mdiLanguageKotlin,
  mdiFile
} from '@mdi/js';
import "../styles/Workspace.css";
import { io } from "socket.io-client";

// 파일 최상단에 socketRef를 컴포넌트 외부에 선언
let globalSocketRef = null;

// 컴포넌트 최상단에 Refs 추가
const Workspace = () => {
  const { projectId } = useParams();
  const initPromiseRef = useRef(null);
  const socketInitializedRef = useRef(false); // 초기화 여부 추적을 위한 새로운 ref

  const [fileTree, setFileTree] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [currentFolder, setCurrentFolder] = useState("");
  const [currentFile, setCurrentFile] = useState("");
  const [fileContent, setFileContent] = useState("// 코드를 작성하세요!");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [fileHistory, setFileHistory] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  const editorRef = useRef(null);
  const autoSaveIntervalRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [activeUsers, setActiveUsers] = useState(0);
  const debounceTimeout = useRef(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);

  // 자동 저장 설정
  const AUTO_SAVE_INTERVAL = 30000; // 30초

  // socket 관련 로직 수정
  const sendWebSocketMessage = (actionType, data) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !projectId) {
      console.warn('[WS] Socket not ready or projectId missing');
      return;
    }
  
    try {
      const message = JSON.stringify({
        action: actionType,
        projectId,
        ...data
      });
      console.log('[WS] Sending message:', message);
      socket.send(message);
    } catch (error) {
      console.error('[WS] Send error:', error);
    }
  };

  // 파일 내용 변경 감지 함수 수정
  const handleEditorChange = useCallback((value) => {
    setFileContent(value);
    setHasUnsavedChanges(true);
  
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
  
    // 실시간 코드 변경 전송
    if (socket && currentFile) {
      debounceTimeout.current = setTimeout(() => {
        socket.emit("codeChange", {
          fileId: currentFile,
          content: value,
          cursorPosition: editorRef.current?.getPosition()
        });
      }, 100);
  
      // 타이핑 상태 전송
      const userName = localStorage.getItem('userName') || '익명';
      socket.emit("typing", {
        fileId: currentFile,
        userName: userName // 실제 사용자 이름 사용
      });
  
      // 타이핑 중지 타이머 설정
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("stopTyping", { fileId: currentFile });
      }, 1000);
    }
  }, [socket, currentFile]);

  const fetchFileTree = useCallback(async (parentId = 'root') => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Missing authentication token");
      }
  
      // Log request details for debugging
      console.log(`Fetching file tree for project: ${projectId}, parentId: ${parentId}`);
  
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/items?parentId=${parentId === 'root' ? '' : parentId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }
  
      const data = await response.json();
      
      if (parentId !== 'root') {
        setFileTree(prevTree => updateTreeNode(prevTree, parentId, data.items));
      } else {
        setFileTree(data.items || []);
      }
    } catch (error) {
      console.error("File tree fetch error:", error);
      setFileTree([]);
    }
  }, [projectId]);

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
    try {
      const isExpanded = expandedFolders.has(folder.id);
      const newExpandedFolders = new Set(expandedFolders);
  
      if (!isExpanded) {
        // 형제 폴더들을 닫는 함수
        const closeSiblingFolders = (tree, targetFolder) => {
          // 같은 parentId를 가진 다른 폴더들 찾아서 닫기
          tree.forEach(item => {
            if (item.type === 'folder' && item.parentId === targetFolder.parentId && item.id !== targetFolder.id) {
              newExpandedFolders.delete(item.id);
              // 닫히는 폴더의 모든 하위 폴더들도 닫기
              if (item.children) {
                closeAllSubFolders(item.children);
              }
            }
            // 재귀적으로 하위 트리도 검사
            if (item.type === 'folder' && item.children) {
              closeSiblingFolders(item.children, targetFolder);
            }
          });
        };
  
        // 모든 하위 폴더를 닫는 함수
        const closeAllSubFolders = (children) => {
          children.forEach(child => {
            if (child.type === 'folder') {
              newExpandedFolders.delete(child.id);
              if (child.children) {
                closeAllSubFolders(child.children);
              }
            }
          });
        };
  
        // 같은 레벨의 다른 폴더들 닫기
        closeSiblingFolders(fileTree, folder);
  
        // 현재 폴더 열기
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
        setCurrentFolder(folder.id);
      } else {
        // 폴더를 닫을 때는 현재 폴더와 그 하위 폴더들만 닫기
        const closeFolder = (currentFolder) => {
          newExpandedFolders.delete(currentFolder.id);
          if (currentFolder.children) {
            currentFolder.children.forEach(child => {
              if (child.type === 'folder') {
                closeFolder(child);
              }
            });
          }
        };
  
        closeFolder(folder);
        setCurrentFolder(folder.parentId || "");
      }
      
      setExpandedFolders(newExpandedFolders);
    } catch (error) {
      console.error("폴더 내용 가져오기 실패:", error);
      alert("폴더 내용을 가져오는데 실패했습니다.");
    }
  };

  // 트리에서 노드를 찾는 헬퍼 함수
  const findNodeById = (tree, nodeId) => {
    for (const node of tree) {
      if (node.id === nodeId) return node;
      if (node.type === 'folder' && node.children) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return null;
  };

  const fetchFileContent = async (file) => {
    if (!file || !file.id) return;
  
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/items/${file.id}/content`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
  
      if (!response.ok) throw new Error("파일 내용을 가져오지 못했습니다.");
  
      const data = await response.json();
      setFileContent(data.content || "");
      setCurrentFile(file.id);
    } catch (error) {
      console.error("파일 내용 가져오기 실패:", error);
      setFileContent("// Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 파일 저장
  const saveFileContent = useCallback(async (isAutoSave = false) => {
    if (!currentFile || (!hasUnsavedChanges && !isAutoSave)) return;

    try {
      // 현재 상태를 히스토리에 저장
      setFileHistory(prev => [
        ...prev, 
        { content: fileContent, timestamp: new Date() }
      ]);

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
            filePath: currentFile,
            content: fileContent,
          }),
        }
      );

      if (!response.ok) throw new Error("파일 저장에 실패했습니다.");
      
      setHasUnsavedChanges(false);
      if (!isAutoSave) {
        alert("파일이 저장되었습니다.");
      }
    } catch (error) {
      console.error("파일 저장 실패:", error);
      if (!isAutoSave) {
        alert("파일 저장에 실패했습니다.");
      }
    }
  }, [currentFile, fileContent]);

  // 컨텍스트 메뉴 처리
  const handleContextMenu = (e, node) => {
    e.preventDefault();
    const menuItems = [
      {
        label: '이름 변경',
        action: () => handleRename(node, e),
      },
      {
        label: '삭제',
        action: () => handleDelete(node),
      },
    ];

    if (node.type === 'folder') {
      menuItems.unshift({
        label: '새 파일',
        action: () => {
          setCurrentFolder(node.id);
          handleCreateFile();
        },
      });
      menuItems.unshift({
        label: '새 폴더',
        action: () => {
          setCurrentFolder(node.id);
          handleCreateFolder();
        },
      });
    }

    setContextMenu({
      x: e.pageX,
      y: e.pageY,
      items: menuItems,
    });
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

      if (socket && createdItem) {
        socket.emit("folderCreate", { folder: createdItem });
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
  
      const createdFile = await response.json();
  
      // 파일 트리 업데이트
      setFileTree(prevTree => {
        if (!currentFolder) {
          return [...prevTree, createdFile];
        }
        return prevTree.map(node => {
          if (node.id === currentFolder) {
            return {
              ...node,
              children: [...(node.children || []), createdFile]
            };
          }
          return node;
        });
      });
  
      // 생성된 파일 자동 선택 (선택 사항)
      setCurrentFile(createdFile.id);
      setFileContent("");  // 새 파일은 빈 내용으로 시작

      if (socket && createdFile) {
        socket.emit("fileCreate", { file: createdFile });
      }
  
    } catch (error) {
      console.error("파일 생성 중 오류:", error);
      alert("파일 생성에 실패했습니다.");
    }
  };

  // 폴더 삭제 핸들러
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
        throw new Error(`${node.type === 'folder' ? '폴더' : '파일'} 삭제에 실패했습니다.`);
      }

      // 파일 트리 상태 업데이트
      setFileTree(prevTree => {
        // 루트 레벨 아이템 삭제
        if (!node.parentId || node.parentId === "") {
          return prevTree.filter(item => item.id !== node.id);
        }

        // 중첩 구조 처리
        const updateChildren = (items) => {
          return items.map(item => {
            if (item.id === node.parentId) {
              return {
                ...item,
                children: item.children.filter(child => child.id !== node.id)
              };
            }
            if (item.children) {
              return {
                ...item,
                children: updateChildren(item.children)
              };
            }
            return item;
          });
        };

        return updateChildren(prevTree);
      });

      // 현재 파일 초기화
      if (node.type === 'file' && node.id === currentFile) {
        setCurrentFile("");
        setFileContent("// 코드를 작성하세요!");
      }

      if (socket) {
        socket.emit("itemDelete", {
          itemId: node.id,
          itemType: node.type
        });
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

      if (socket) {
        sendWebSocketMessage('itemRename', { 
          projectId, 
          itemId: node.id, 
          newName 
        });
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
      <li 
        className={node.type} 
        style={{ marginLeft: `${indent}px` }}
        draggable
        onDragStart={(e) => handleDragStart(e, node)}
        onDragOver={handleDragOver}
        onDrop={(e) => node.type === 'folder' && handleDrop(e, node)}
      >
        <div className="tree-node-container">
          <div 
            onClick={() => node.type === 'folder' ? handleFolderClick(node) : handleFileClick(node)}
            className={`tree-node ${node.type} ${isExpanded ? 'expanded' : ''}`}
          >
            {node.type === 'folder' ? (
              <span className="folder-arrow">
                {isExpanded ? '▼' : '▶'}
              </span>
            ) : null}
            <span className="icon">
              {node.type === 'folder' 
                ? '📁'
                : getFileIcon(node.name)
              }
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

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e, node) => {
    e.stopPropagation();
    setDraggedNode(node);
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: node.id,
      type: node.type,
      path: node.path
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
    setDraggedNode(null);
    const dropTargets = document.querySelectorAll('.drop-target');
    dropTargets.forEach(target => target.classList.remove('drop-target'));
  };

  const handleDragEnter = (e) => {
    if (draggedNode && e.currentTarget.classList.contains('folder')) {
      e.currentTarget.classList.add('drop-target');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    // file-tree에 드래그 오버 효과 추가
    if (e.currentTarget.classList.contains('file-tree')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('drop-target');
  };

  const handleDrop = async (e, targetNode) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
      
      // 대상이 파일이거나 같은 노드면 이동 불가
      if (targetNode.type !== 'folder' || draggedData.id === targetNode.id) {
        return;
      }

      // 순환 참조 방지
      if (targetNode.path.startsWith(draggedData.path)) {
        alert("폴더를 자신의 하위 폴더로 이동할 수 없습니다.");
        return;
      }

      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/items/${draggedData.id}/move`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            newParentId: targetNode.id
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to move item");
      }

      await fetchFileTree();

      if (socket) {
        sendWebSocketMessage('itemMove', { 
          projectId, 
          itemId: draggedData.id, 
          newParentId: targetNode.id 
        });
      }
    } catch (error) {
      console.error("Error moving item:", error);
      alert(error.message);
    }
  };

  const handleRootDrop = async (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  
    // 드롭 영역 검증
    const dropTarget = e.target.closest('.file-tree');
    if (!dropTarget) return;
  
    try {
      const draggedData = JSON.parse(e.dataTransfer.getData('text/plain'));
      const token = localStorage.getItem("token");
      
      const response = await fetch(
        `http://localhost:5001/api/filesystem/items/${draggedData.id}/move`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            newParentId: ""  // 루트로 이동
          }),
        }
      );
  
      if (!response.ok) {
        const error = await response.json();
        throw error;
      }
  
      // 트리 새로고침
      await fetchFileTree();
    } catch (error) {
      console.error("루트로 이동 실패:", error);
      alert(error.message || "아이템 이동에 실패했습니다.");
    }
  };

  // 검색 핸들러
  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:5001/api/filesystem/${projectId}/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setSearchResults(data.items);
    } catch (error) {
      console.error("Search error:", error);
      alert("Search failed");
    }
  };

  const BreadcrumbNav = ({ path }) => {
    if (!path) return null;
    const parts = path.split('/').filter(Boolean);
    
    return (
      <div className="breadcrumb">
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="separator">/</span>}
            <span className="breadcrumb-item">{part}</span>
          </React.Fragment>
        ))}
      </div>
    );
  };
  
  const ContextMenu = ({ x, y, items, onClose }) => (
    <div 
      className="context-menu" 
      style={{ left: x, top: y }}
      onMouseLeave={onClose}
    >
      {items.map(item => (
        <div
          key={item.label}
          className="context-menu-item"
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );

  const revertToLastVersion = useCallback(() => {
    if (fileHistory.length === 0) return;
    
    const lastVersion = fileHistory[fileHistory.length - 1];
    setFileContent(lastVersion.content);
    setFileHistory(prev => prev.slice(0, -1));
    setHasUnsavedChanges(true);
  }, [fileHistory]);

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'js':
        return <Icon path={mdiLanguageJavascript} size={1} />;
      case 'jsx':
        return <Icon path={mdiReact} size={1} />;
      case 'json':
        return <Icon path={mdiCodeJson} size={1} />;
      case 'md':
        return <Icon path={mdiLanguageMarkdown} size={1} />;
      case 'css':
        return <Icon path={mdiLanguageCss3} size={1} />;
      case 'html':
        return <Icon path={mdiLanguageHtml5} size={1} />;
      case 'bat':
        return <Icon path={mdiConsole} size={1} />;
      case 'properties':
      default:
        return <Icon path={mdiFile} size={1} />;
    }
  };

  useEffect(() => {
    fetchFileTree();
  }, [projectId, fetchFileTree]);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();  // 브라우저 기본 저장 동작 방지
        if (currentFile) {
          await saveFileContent();
        }
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFile, fileContent]);

  useEffect(() => {
    if (currentFile && hasUnsavedChanges) {
      const interval = setInterval(() => {
        saveFileContent(true);
      }, AUTO_SAVE_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [currentFile, hasUnsavedChanges, saveFileContent]);

  useEffect(() => {
    let socket = null;

    const initSocket = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!projectId || !token) return;

        socket = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:5001', {
          path: "/socket",
          auth: { token },
          query: { projectId }
        });

        socket.on("connect", () => {
          console.log("[Socket.IO] Connected");
          socket.emit("joinProject", projectId);
        });

        socket.on("activeUsers", ({ count }) => {
          setActiveUsers(count);
        });

        socket.on("codeUpdate", ({ fileId, content, cursorPosition, senderId }) => {
          if (fileId === currentFile && senderId !== socket.id) {
            setFileContent(content);
            if (cursorPosition && editorRef.current) {
              editorRef.current.setPosition(cursorPosition);
            }
          }
        });

        socket.on("fileTreeUpdate", () => {
          fetchFileTree();
        });

        socket.on("requestFileTree", () => {
          fetchFileTree();
        });

        socket.on("userTyping", ({ fileId, users }) => {
          if (fileId === currentFile) {
            setTypingUsers(users);
          }
        });

        setSocket(socket);
      } catch (error) {
        console.error("[Socket.IO] Init error:", error);
      }
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [projectId, currentFile]);

  // 메시지 전송 함수 수정
  const sendSocketMessage = useCallback((eventName, data) => {
    if (!socket?.connected) {
      console.warn("[Socket.IO] Not connected");
      return;
    }
    socket.emit(eventName, { ...data, projectId });
  }, [socket, projectId]);

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div className="active-users">
          🟢 활성 사용자: {activeUsers}명
        </div>
      </div>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="search-box">
            <input
              type="text"
              placeholder="검색..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleSearch(e.target.value);
              }}
              className="search-input"
            />
          </div>
          <div className="button-group">
            <button onClick={handleCreateFolder}>새 폴더</button>
            <button onClick={handleCreateFile}>새 파일</button>
          </div>
        </div>
        <ul
          className={`file-tree ${isDraggingOver ? 'dragover' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleRootDrop}
        >
          {searchResults ? (
            searchResults.map(node => (
              <FileTreeNode
                key={node.id}
                node={node}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
              />
            ))
          ) : (
            fileTree.map(node => (
              <FileTreeNode
                key={node.id}
                node={node}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
              />
            ))
          )}
        </ul>
      </div>

      <div className="editor">
        <div className="editor-header">
          <div className="file-info">
            {currentFile ? (
              <>
                <BreadcrumbNav path={currentFile} />
                {hasUnsavedChanges && <span className="unsaved-indicator">●</span>}
              </>
            ) : (
              <span className="welcome-text">파일을 선택하세요</span>
            )}
          </div>
          {currentFile && (
            <div className="editor-actions">
              {fileHistory.length > 0 && (
                <button
                  onClick={revertToLastVersion}
                  className="revert-button"
                  title="이전 버전으로 되돌리기"
                >
                  ↩️
                </button>
              )}
              <button
                onClick={() => saveFileContent(false)}
                className={`save-button ${hasUnsavedChanges ? 'unsaved' : ''}`}
                title="Ctrl/Cmd + S"
              >
                💾 저장
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="editor-content">
              <Editor
                height="calc(100vh - 40px)"
                defaultLanguage="javascript"
                value={fileContent}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  lineNumbers: 'on',
                  glyphMargin: true,
                  folding: true,
                  lineDecorationsWidth: 10,
                  formatOnPaste: true,
                  formatOnType: true
                }}
                onChange={handleEditorChange}
                onMount={(editor) => {
                  editorRef.current = editor;
                }}
              />
              {typingUsers.length > 0 && (
                <div className="typing-indicator">
                  {typingUsers.map((user, index) => (
                    <span key={index}>
                      {user} 타이핑 중
                      {index < typingUsers.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {contextMenu && (
        <ContextMenu
          {...contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default Workspace;