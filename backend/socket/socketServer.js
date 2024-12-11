const pty = require('node-pty');
const os = require('os');
const path = require('path');

// 터미널 세션 저장소
const terminals = new Map();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("새로운 소켓 연결:", socket.id);

    // 프로젝트 참가
    socket.on("joinProject", (projectId) => {
      socket.join(projectId);
      console.log(`Client ${socket.id} joined project ${projectId}`);
    });

    // 코드 변경 이벤트
    socket.on("codeChange", ({ projectId, code }) => {
      socket.to(projectId).emit("codeUpdate", { code });
    });

    // 터미널 세션 참가
    socket.on('join-terminal', async ({ projectId }) => {
      try {
        console.log('터미널 세션 참가:', projectId);
        
        // 터미널 세션 ID 생성
        const terminalId = `${projectId}-${socket.id}`;
        
        // 프로젝트 디렉토리 설정
        const projectDir = path.join(process.cwd(), 'projects', projectId);
        
        // 쉘 프로세스 생성
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        const term = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 24,
          cwd: projectDir,
          env: process.env
        });

        // 터미널 출력 처리
        term.onData((data) => {
          socket.emit('terminal-output', data);
        });

        // 터미널 저장
        terminals.set(terminalId, {
          term,
          projectId
        });

        console.log(`Terminal created for project ${projectId}`);
      } catch (error) {
        console.error('터미널 생성 실패:', error);
        socket.emit('terminal-error', { 
          error: 'Failed to create terminal session' 
        });
      }
    });

    // 터미널 입력 처리
    socket.on('terminal-input', async ({ projectId, data }) => {
      try {
        const terminalId = `${projectId}-${socket.id}`;
        const terminal = terminals.get(terminalId);

        if (terminal && terminal.term) {
          terminal.term.write(data);
        } else {
          throw new Error('Terminal session not found');
        }
      } catch (error) {
        console.error('터미널 입력 처리 실패:', error);
        socket.emit('terminal-error', { 
          error: 'Failed to process terminal input' 
        });
      }
    });

    // 터미널 크기 조정
    socket.on('terminal-resize', ({ projectId, cols, rows }) => {
      try {
        const terminalId = `${projectId}-${socket.id}`;
        const terminal = terminals.get(terminalId);
        
        if (terminal && terminal.term) {
          terminal.term.resize(cols, rows);
        }
      } catch (error) {
        console.error('터미널 크기 조정 실패:', error);
      }
    });

    // 연결 해제 시 터미널 정리
    socket.on('disconnect', () => {
      try {
        console.log('소켓 연결 해제:', socket.id);
        
        // 해당 소켓의 모든 터미널 찾아서 정리
        for (const [terminalId, terminal] of terminals.entries()) {
          if (terminalId.includes(socket.id)) {
            terminal.term.kill();
            terminals.delete(terminalId);
            console.log(`Terminal ${terminalId} cleaned up`);
          }
        }
      } catch (error) {
        console.error('터미널 정리 중 에러:', error);
      }
    });

    // 에러 처리
    socket.on('error', (error) => {
      console.error('Socket error:', error);
      socket.emit('terminal-error', { 
        error: 'Internal socket error' 
      });
    });
  });

  // 주기적으로 비활성 터미널 정리
  setInterval(() => {
    try {
      const now = Date.now();
      for (const [terminalId, terminal] of terminals.entries()) {
        if (now - terminal.lastActivity > 1000 * 60 * 30) { // 30분 이상 비활성
          terminal.term.kill();
          terminals.delete(terminalId);
          console.log(`Inactive terminal ${terminalId} cleaned up`);
        }
      }
    } catch (error) {
      console.error('터미널 정리 중 에러:', error);
    }
  }, 1000 * 60 * 5); // 5분마다 체크
};