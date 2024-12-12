import React, { useEffect, useRef } from 'react';
import { Editor } from "@monaco-editor/react";
import { io } from "socket.io-client";

const CollaborativeEditor = ({ projectId, filepath, content }) => {
  const editorRef = useRef(null);
  const socketRef = useRef(null);
  const decorationsRef = useRef([]);

  useEffect(() => {
    socketRef.current = io('http://your-server:5001');
    
    // 프로젝트 참여
    socketRef.current.emit('join-editor', { projectId, filepath });

    // 다른 사용자의 커서 위치 수신
    socketRef.current.on('cursor-update', ({ userId, username, position, selection }) => {
      if (!editorRef.current) return;
      
      updateUserCursor(userId, username, position, selection);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [projectId, filepath]);

  const updateUserCursor = (userId, username, position, selection) => {
    const editor = editorRef.current;
    
    // 이전 데코레이션 제거
    const oldDecorations = decorationsRef.current.filter(d => d.userId === userId);
    editor.deltaDecorations(oldDecorations.map(d => d.id), []);

    const newDecorations = [];

    // 커서 데코레이션
    if (position) {
      newDecorations.push({
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        options: {
          className: `cursor-${userId}`,
          glyphMarginClassName: `glyph-${userId}`,
          hoverMessage: { value: username },
          minimap: false,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        }
      });
    }

    // 선택 영역 데코레이션
    if (selection) {
      newDecorations.push({
        range: new monaco.Range(
          selection.startLineNumber,
          selection.startColumn,
          selection.endLineNumber,
          selection.endColumn
        ),
        options: {
          className: `selection-${userId}`,
          minimap: false,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        }
      });
    }

    // 새 데코레이션 추가
    const ids = editor.deltaDecorations([], newDecorations);
    decorationsRef.current = decorationsRef.current.filter(d => d.userId !== userId);
    decorationsRef.current.push(...ids.map((id, i) => ({
      id,
      userId,
      type: i === 0 ? 'cursor' : 'selection'
    })));
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;

    // 커서 위치 변경 감지
    editor.onDidChangeCursorPosition(e => {
      socketRef.current?.emit('cursor-move', {
        projectId,
        filepath,
        position: e.position
      });
    });

    // 선택 영역 변경 감지
    editor.onDidChangeCursorSelection(e => {
      socketRef.current?.emit('selection-change', {
        projectId,
        filepath,
        selection: e.selection
      });
    });
  };

  return (
    <div className="collaborative-editor">
      <Editor
        height="100vh"
        defaultLanguage="javascript"
        value={content}
        options={{
          minimap: { enabled: true },
          scrollBeyondLastLine: false
        }}
        onMount={handleEditorDidMount}
      />
      <style>
        {`
          .cursor {
            width: 2px !important;
            background: var(--cursor-color);
          }
          .selection {
            background: var(--selection-color);
            opacity: 0.3;
          }
        `}
      </style>
    </div>
  );
};

export default CollaborativeEditor;