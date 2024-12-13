import React from "react";
import MonacoEditor from "react-monaco-editor";
import "../styles/Workspace.css";

const Editor = ({ fileContent, onContentChange }) => {
  return (
    <div className="editor">
      <MonacoEditor
        height="calc(100vh - 60px)" // Topbar와 StatusBar 제외
        language="javascript"
        theme="vs-dark"
        value={fileContent}
        onChange={onContentChange}
      />
    </div>
  );
};

export default Editor;