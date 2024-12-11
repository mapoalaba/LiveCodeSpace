const pty = require('node-pty');
const os = require('os');

const terminals = new Map();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("[Socket.IO] User connected:", socket.id);

    socket.on('join-terminal', ({ projectId }) => {
      try {
        console.log("Client joined terminal:", projectId);
        const terminalId = `${projectId}-${socket.id}`;
        
        // 터미널 프로세스 생성
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        const term = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          env: { 
            ...process.env, 
            TERM: 'xterm-256color',
            PROJECT_ID: projectId
          }
        });

        // 터미널 저장
        terminals.set(terminalId, {
          term,
          projectId,
          lastActivity: Date.now()
        });

        // 터미널 출력 처리
        term.onData((data) => {
          socket.emit('terminal-output', data);
        });

        console.log("Terminal created for project", projectId);
        term.write(`\r\nWelcome to project ${projectId}\r\n`);

        // 터미널 입력 처리
        socket.on('terminal-input', ({ projectId: inputProjectId, data }) => {
          const terminal = terminals.get(terminalId);
          if (terminal?.term) {
            try {
              terminal.lastActivity = Date.now();
              terminal.term.write(data);
            } catch (error) {
              console.error('Terminal input error:', error);
              socket.emit('terminal-error', { error: 'Failed to process input' });
            }
          }
        });

        // 터미널 크기 조정
        socket.on('terminal-resize', ({ cols, rows }) => {
          const terminal = terminals.get(terminalId);
          if (!terminal?.term) {
            console.log('Terminal not found for resize');
            return;
          }

          try {
            if (cols > 0 && rows > 0) {  // 유효한 크기인지 확인
              terminal.term.resize(cols, rows);
              console.log(`Terminal resized to ${cols}x${rows}`);
            }
          } catch (error) {
            console.error('Terminal resize error:', error);
            // 에러를 클라이언트에 알림
            socket.emit('terminal-error', { 
              error: 'Failed to resize terminal' 
            });
          }
        });

        // 연결 해제 시 정리
        socket.on('disconnect', () => {
          try {
            console.log("Cleaning up terminal:", terminalId);
            const terminal = terminals.get(terminalId);
            if (terminal?.term) {
              terminal.term.kill();
              terminals.delete(terminalId);
              console.log(`Terminal ${terminalId} cleaned up`);
            }
          } catch (error) {
            console.error('Terminal cleanup error:', error);
          }
        });

      } catch (error) {
        console.error("Terminal creation error:", error);
        socket.emit('terminal-error', { 
          error: 'Failed to create terminal session' 
        });
      }
    });
  });

  // 비활성 터미널 정리
  setInterval(() => {
    const now = Date.now();
    for (const [terminalId, terminal] of terminals.entries()) {
      if (now - terminal.lastActivity > 30 * 60 * 1000) {
        try {
          terminal.term.kill();
          terminals.delete(terminalId);
          console.log(`Inactive terminal ${terminalId} cleaned up`);
        } catch (error) {
          console.error('Terminal cleanup error:', error);
        }
      }
    }
  }, 5 * 60 * 1000);
};