import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import io from 'socket.io-client';
import 'xterm/css/xterm.css';

const TerminalComponent = forwardRef(({ projectId }, ref) => {
  const terminalRef = useRef(null);
  const socketRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const searchAddonRef = useRef(null);
  const commandBufferRef = useRef('');

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (xtermRef.current) {
        xtermRef.current.clear();
      }
    },
    search: (query) => {
      if (searchAddonRef.current) {
        searchAddonRef.current.findNext(query);
      }
    }
  }));

  useEffect(() => {
    const initTerminal = async () => {
      if (!terminalRef.current || xtermRef.current) return;

      try {
        // 터미널 설정
        const term = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#ffffff',
            cursor: '#ffffff'
          },
          allowTransparency: true,
          scrollback: 1000,
          rows: 24,
          cols: 80,
          convertEol: true,
          cursorStyle: 'block'
        });

        // 애드온 설정
        const fitAddon = new FitAddon();
        const searchAddon = new SearchAddon();
        const webLinksAddon = new WebLinksAddon();

        term.loadAddon(fitAddon);
        term.loadAddon(searchAddon);
        term.loadAddon(webLinksAddon);

        // 참조 저장
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = searchAddon;

        // DOM에 터미널 연결
        term.open(terminalRef.current);
        
        // 초기 크기 조정
        setTimeout(() => {
          try {
            fitAddon.fit();
          } catch (error) {
            console.error('Initial fit failed:', error);
          }
        }, 100);

        // 소켓 연결
        const socket = io('http://localhost:5001', {
          path: '/socket',
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          withCredentials: true
        });

        socketRef.current = socket;

        // 소켓 이벤트 핸들러
        socket.on('connect', () => {
          console.log('Socket connected');
          socket.emit('join-terminal', { projectId });
          term.write('\r\n\x1b[32mTerminal connected\x1b[0m\r\n$ ');
        });

        socket.on('disconnect', () => {
          console.log('Socket disconnected');
          term.write('\r\n\x1b[31mConnection lost. Reconnecting...\x1b[0m\r\n');
        });

        socket.on('terminal-output', (data) => {
          try {
            term.write(data);
          } catch (error) {
            console.error('Error writing terminal output:', error);
          }
        });

        socket.on('terminal-error', ({ error }) => {
          try {
            term.write(`\r\n\x1b[31mError: ${error}\x1b[0m\r\n$ `);
          } catch (error) {
            console.error('Error writing terminal error:', error);
          }
        });

        // 입력 처리
        term.onData((data) => {
          try {
            socket.emit('terminal-input', {
              projectId,
              data
            });
          } catch (error) {
            console.error('Error sending terminal input:', error);
          }
        });

        // 크기 조정 처리
        const resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            try {
              fitAddon.fit();
              socket.emit('terminal-resize', {
                cols: term.cols,
                rows: term.rows
              });
            } catch (error) {
              console.error('Resize failed:', error);
            }
          });
        });

        resizeObserver.observe(terminalRef.current);

        // 클린업
        return () => {
          try {
            resizeObserver.disconnect();
            socket.disconnect();
            term.dispose();
          } catch (error) {
            console.error('Cleanup failed:', error);
          }
        };
      } catch (error) {
        console.error('Terminal initialization failed:', error);
      }
    };

    initTerminal();
  }, [projectId]);

  return (
    <div
      ref={terminalRef}
      className="terminal-container"
      style={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#1e1e1e',
        padding: '4px'
      }}
    />
  );
});

export default TerminalComponent;