import logo from './logo.svg';
import './App.css';
import React from "react";
import { Editor } from "@monaco-editor/react";

function App() {
  const code = "// Write your code here...";

  return (
    <div style={{ height: "100vh" }}>
      <Editor
        height="100%"
        defaultLanguage="javascript"
        defaultValue={code}
        theme="vs-dark"
      />
    </div>
  );
}


export default App;
