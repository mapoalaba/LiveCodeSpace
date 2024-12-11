import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import io from 'socket.io-client';
import 'xterm/css/xterm.css';

const TerminalComponent = forwardRef(({ projectId }, ref) => {
  const terminalRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const [socket, setSocket] = useState(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const [inputBuffer, setInputBuffer] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentInput, setCurrentInput] = useState('');
  const [processes, setProcesses] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  // 기본 명령어 목록
  const commands = [
    'npm', 'node', 'git', 'ls', 'cd', 'mkdir', 'rm', 'cp', 'mv',
    'touch', 'cat', 'echo', 'pwd', 'clear'
  ];

  // 자동 완성 함수
  const handleTabComplete = (input) => {
    const words = input.split(' ');
    const lastWord = words[words.length - 1];
    
    const matches = commands.filter(cmd => 
      cmd.toLowerCase().startsWith(lastWord.toLowerCase())
    );

    if (matches.length === 1) {
      words[words.length - 1] = matches[0];
      return words.join(' ');
    } else if (matches.length > 1) {
      if (terminal) {
        terminal.write('\r\n' + matches.join('  ') + '\r\n');
        terminal.write('\r\n$ ' + input);
      }
      setSuggestions(matches);
      return input;
    }
    return input;
  };

  // 터미널 클리어 함수
  const clearTerminal = () => {
    if (terminal) {
      terminal.clear();
    }
  };

  // 외부에서 접근 가능한 메서드 설정
  useImperativeHandle(ref, () => ({
    clear: clearTerminal,
    search: (query) => {
      if (searchAddonRef.current) {
        searchAddonRef.current.findNext(query);
      }
    }
  }));

  useEffect(() => {
    const initializeTerminal = () => {
      if (!terminalRef.current) return;

      // 터미널 초기화
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#ffffff'
        },
        allowTransparency: true
      });

      // 애드온 설정
      fitAddonRef.current = new FitAddon();
      searchAddonRef.current = new SearchAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddonRef.current);
      term.loadAddon(searchAddonRef.current);
      term.loadAddon(webLinksAddon);

      // 터미널을 DOM에 부착
      term.open(terminalRef.current);
      setTerminal(term);

      // 소켓 연결
      const newSocket = io('http://localhost:5001', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true,
        transports: ['websocket', 'polling']
      });

      // 소켓 이벤트 핸들러 설정
      newSocket.on('connect', () => {
        console.log('Socket connected');
        newSocket.emit('join-terminal', { projectId });
        term.write('\r\n\x1b[1;34m Welcome to the project terminal! \x1b[0m\r\n');
        term.write('\r\n\x1b[32m✓ Connected to terminal server\x1b[0m\r\n$ ');
      });

      newSocket.on('terminal-output', (data) => {
        term.write(data);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        term.write('\r\n\x1b[31mError: Failed to connect to terminal server (Port 5001)\x1b[0m\r\n');
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        term.write('\r\n\x1b[32m✓ Reconnected to terminal server\x1b[0m\r\n');
      });

      newSocket.on('process-update', (data) => {
        setProcesses(data.processes);
      });

      // 터미널 입력 처리
      term.onData((data) => {
        // Tab key
        if (data === '\t') {
          const completedInput = handleTabComplete(inputBuffer);
          if (completedInput !== inputBuffer) {
            term.write('\r\x1b[K$ ' + completedInput);
            setInputBuffer(completedInput);
          }
        }
        // Enter key
        else if (data === '\r') {
          if (inputBuffer) {
            newSocket.emit('terminal-input', {
              projectId,
              data: inputBuffer + '\n',
              timestamp: new Date().toISOString()
            });
            setCommandHistory(prev => [inputBuffer, ...prev]);
            setInputBuffer('');
            setHistoryIndex(-1);
            setSuggestions([]);
          }
          term.write('\r\n');
        }
        // Up arrow
        else if (data === '\x1b[A') {
          if (historyIndex < commandHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const command = commandHistory[newIndex];
            term.write('\r\x1b[K$ ' + command);
            setInputBuffer(command);
          }
        }
        // Down arrow
        else if (data === '\x1b[B') {
          if (historyIndex > -1) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const command = newIndex === -1 ? '' : commandHistory[newIndex];
            term.write('\r\x1b[K$ ' + command);
            setInputBuffer(command);
          }
        }
        // Backspace
        else if (data === '\x7f') {
          if (inputBuffer.length > 0) {
            term.write('\b \b');
            setInputBuffer(prev => prev.slice(0, -1));
          }
        }
        // Regular input
        else {
          term.write(data);
          setInputBuffer(prev => prev + data);
        }
      });

      setSocket(newSocket);

      // ResizeObserver 설정
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddonRef.current && terminalRef.current?.offsetHeight > 0) {
          try {
            fitAddonRef.current.fit();
            if (term && newSocket) {
              newSocket.emit('terminal-resize', {
                projectId,
                cols: term.cols,
                rows: term.rows
              });
            }
            term.scrollToBottom();
          } catch (error) {
            console.error('Error fitting terminal:', error);
          }
        }
      });

      resizeObserver.observe(terminalRef.current);

      // 클린업
      return () => {
        resizeObserver.disconnect();
        if (newSocket) {
          newSocket.disconnect();
        }
        term.dispose();
      };
    };

    initializeTerminal();
  }, [projectId]);

  // 프로세스 모니터링
  useEffect(() => {
    socket?.on('process-update', (data) => {
      setProcesses(data.processes);
    });

    return () => {
      socket?.off('process-update');
    };
  }, [socket]);

  return (
    <div 
      className="terminal-container" 
      ref={terminalRef}
      style={{
        height: '100%',
        width: '100%',
        padding: '4px',
        backgroundColor: '#1e1e1e',
        overflow: 'hidden'
      }}
    />
  );
});

export default TerminalComponent;