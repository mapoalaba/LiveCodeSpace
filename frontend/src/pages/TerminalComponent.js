import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

const TerminalComponent = () => {
  const terminalRef = useRef(null);
  const terminalInstance = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    // 터미널 초기화
    terminalInstance.current = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff'
      },
      fontSize: 14,
      fontFamily: 'Consolas, "Liberation Mono", courier, monospace'
    });

    const fitAddon = new FitAddon();
    terminalInstance.current.loadAddon(fitAddon);
    terminalInstance.current.loadAddon(new WebLinksAddon());

    terminalInstance.current.open(terminalRef.current);
    fitAddon.fit();

    // WebSocket 연결
    wsRef.current = new WebSocket('ws://localhost:5002');
    
    wsRef.current.onopen = () => {
      terminalInstance.current.writeln('Connected to terminal');
    };

    wsRef.current.onmessage = (event) => {
      terminalInstance.current.write(event.data);
    };

    wsRef.current.onclose = () => {
      terminalInstance.current.writeln('Disconnected from terminal');
    };

    // 터미널 입력 처리
    terminalInstance.current.onData(data => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    // 창 크기 조절 이벤트 처리
    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      if (terminalInstance.current) terminalInstance.current.dispose();
    };
  }, []);

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <span>Terminal</span>
      </div>
      <div ref={terminalRef} className="terminal" />
    </div>
  );
};

export default TerminalComponent;