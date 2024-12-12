const pty = require('node-pty');
const os = require('os');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// 터미널 명령어 핸들러
const commands = {
  async pwd(session, socket) {
    socket.emit('terminal-output', '\r\n');
    socket.emit('terminal-output', session.currentPath);
    socket.emit('terminal-output', '\r\n\r\n');
  },

  async ls(session, socket, args) {
    try {
      const currentPrefix = session.currentPath.slice(1);
      const normalizedPrefix = currentPrefix.endsWith('/') ? currentPrefix : `${currentPrefix}/`;

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: normalizedPrefix,
        Delimiter: '/'
      };

      const data = await s3.listObjectsV2(params).promise();
      socket.emit('terminal-output', '\r\n');

      let hasContent = false;

      if (data.CommonPrefixes && data.CommonPrefixes.length > 0) {
        for (const prefix of data.CommonPrefixes) {
          const folderName = prefix.Prefix.slice(normalizedPrefix.length).split('/')[0];
          if (folderName) {
            socket.emit('terminal-output', `\x1b[34m${folderName}/\x1b[0m  `);
            hasContent = true;
          }
        }
      }

      if (data.Contents) {
        for (const content of data.Contents) {
          const relativePath = content.Key.slice(normalizedPrefix.length);
          const fileName = relativePath.split('/')[0];
          if (fileName && !content.Key.endsWith('/')) {
            socket.emit('terminal-output', `${fileName}  `);
            hasContent = true;
          }
        }
      }

      if (!hasContent) {
        socket.emit('terminal-output', 'Empty directory');
      }

      socket.emit('terminal-output', '\r\n\r\n');
    } catch (error) {
      socket.emit('terminal-output', `\r\nError: ${error.message}\r\n\r\n`);
    }
  },
};

module.exports = (io) => {
  const projectClients = new Map();
  const typingUsers = new Map();
  const fileEditors = new Map();
  const terminals = new Map();

  const updateActiveUsers = (projectId) => {
    const clients = projectClients.get(projectId) || new Set();
    io.to(projectId).emit("activeUsers", { count: clients.size });
  };

  const updateFileEditors = (fileId, projectId) => {
    const editors = fileEditors.get(fileId) || new Set();
    console.log(`[Socket.IO] File ${fileId} editors:`, Array.from(editors));
    io.to(projectId).emit("activeEditors", { 
      fileId, 
      editors: Array.from(editors) 
    });
  };

  io.on("connection", (socket) => {
    console.log("[Socket.IO] New connection:", socket.id);

    // 인증 처리
    socket.on("authenticate", ({ token, projectId }) => {
      if (!token || !projectId) {
        socket.disconnect();
        return;
      }
      socket.projectId = projectId;
      socket.auth = { token };
    });

    // 프로젝트 참여
    socket.on("joinProject", (projectId) => {
      if (!projectId) return;
      
      if (socket.currentProject) {
        socket.leave(socket.currentProject);
        const clients = projectClients.get(socket.currentProject);
        if (clients) {
          clients.delete(socket.id);
          updateActiveUsers(socket.currentProject);
        }
      }

      socket.join(projectId);
      socket.currentProject = projectId;

      if (!projectClients.has(projectId)) {
        projectClients.set(projectId, new Set());
      }
      projectClients.get(projectId).add(socket.id);
      updateActiveUsers(projectId);

      socket.emit("requestFileTree");
    });

    // 실시간 코드 편집
    socket.on("codeChange", ({ fileId, content, cursorPosition }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("codeUpdate", {
        fileId,
        content,
        cursorPosition,
        senderId: socket.id
      });
    });

    // 파일 관련 이벤트들
    socket.on("fileCreate", ({ file }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("fileCreated", { file });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    socket.on("folderCreate", ({ folder }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("folderCreated", { folder });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    socket.on("itemDelete", ({ itemId, itemType }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("itemDeleted", { itemId, itemType });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    // 타이핑 상태 관리
    socket.on("typing", ({ fileId, userName }) => {
      if (!socket.currentProject) return;
      
      const fileKey = `${socket.currentProject}:${fileId}`;
      if (!typingUsers.has(fileKey)) {
        typingUsers.set(fileKey, new Map());
      }
      const fileTypingUsers = typingUsers.get(fileKey);
      fileTypingUsers.set(socket.id, {
        userName,
        timestamp: Date.now()
      });

      io.to(socket.currentProject).emit("userTyping", {
        fileId,
        users: Array.from(fileTypingUsers.values()).map(u => u.userName)
      });
    });

    socket.on("stopTyping", ({ fileId }) => {
      if (!socket.currentProject) return;
      
      const fileKey = `${socket.currentProject}:${fileId}`;
      const fileTypingUsers = typingUsers.get(fileKey);
      if (fileTypingUsers) {
        fileTypingUsers.delete(socket.id);
        io.to(socket.currentProject).emit("userTyping", {
          fileId,
          users: Array.from(fileTypingUsers.values()).map(u => u.userName)
        });
      }
    });

    // 파일 편집 참여/떠나기
    socket.on("joinFile", ({ fileId, userName }) => {
      if (!socket.currentProject || !fileId) return;
      
      if (!fileEditors.has(fileId)) {
        fileEditors.set(fileId, new Set());
      }
      fileEditors.get(fileId).add(userName);
      updateFileEditors(fileId, socket.currentProject);
    });

    socket.on("leaveFile", ({ fileId, userName }) => {
      if (!fileId) return;
      
      const editors = fileEditors.get(fileId);
      if (editors) {
        editors.delete(userName);
        updateFileEditors(fileId, socket.currentProject);
      }
    });


    
 // 터미널 세션 생성
 socket.on('join-terminal', async ({ projectId }) => {
  try {
    console.log(`Creating terminal for project: ${projectId}`);
    
    // 기존 세션이 있다면 정리
    if (terminals.has(socket.id)) {
      const existingSession = terminals.get(socket.id);
      if (existingSession.term) {
        existingSession.term.kill();
      }
      terminals.delete(socket.id);
    }

    // 새 터미널 세션 생성
    let session = {
      projectId,
      currentPath: `/${projectId}`,
      currentCommand: '',
      lastActivity: Date.now()
    };
    
    terminals.set(socket.id, session);
    console.log(`Terminal session created for socket ${socket.id}`);

    // 초기 프롬프트 전송
    socket.emit('terminal-output', `${session.currentPath} $ `);
    
    socket.join(`terminal-${projectId}`);
  } catch (error) {
    console.error('Terminal creation error:', error);
    socket.emit('terminal-error', { error: error.message });
  }
});

// 터미널 입력 처리
socket.on('terminal-input', async ({ projectId, data }) => {
  try {
    let session = terminals.get(socket.id);
    if (!session) {
      session = {
        projectId,
        currentPath: `/${projectId}`,
        currentCommand: '',
        lastActivity: Date.now()
      };
      terminals.set(socket.id, session);
    }

    session.lastActivity = Date.now();

    if (data === '\r' || data === '\n') {
      const commandLine = session.currentCommand.trim();
      const [command, ...args] = commandLine.split(' ');

      if (command && commands[command]) {
        await commands[command](session, socket, args);
      } else if (command) {
        socket.emit('terminal-output', '\r\nCommand not found. Type "help" for available commands\r\n\r\n');
      }

      session.currentCommand = '';
      socket.emit('terminal-output', `${session.currentPath}$ `);
    } else if (data === '\b' || data === '\x7f') {
      if (session.currentCommand.length > 0) {
        session.currentCommand = session.currentCommand.slice(0, -1);
        socket.emit('terminal-output', '\b \b');
      }
    } else {
      session.currentCommand += data;
      socket.emit('terminal-output', data);
    }
  } catch (error) {
    console.error('Terminal input error:', error);
    socket.emit('terminal-error', { error: error.message });
  }
});

// 디버깅을 위한 추가 이벤트 리스너
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

socket.on('disconnect', () => {
  console.log('Client disconnected:', socket.id);
  const session = terminals.get(socket.id);
  if (session) {
    terminals.delete(socket.id);
  }
});

// 터미널 크기 조정
socket.on('terminal-resize', ({ cols, rows }) => {
  try {
    const session = terminals.get(socket.id);
    if (session && session.term) {
      session.term.resize(cols, rows);
    }
  } catch (error) {
    console.error('Terminal resize error:', error);
  }
});

// 연결 해제 처리
socket.on("disconnect", () => {
  try {
    console.log(`Client disconnected: ${socket.id}`);
    const session = terminals.get(socket.id);
    if (session) {
      terminals.delete(socket.id);
    }
  } catch (error) {
    console.error('Disconnect cleanup error:', error);
  }
});
});

// 비활성 터미널 정리
setInterval(() => {
const now = Date.now();
for (const [socketId, session] of terminals.entries()) {
  if (now - session.lastActivity > 1000 * 60 * 30) { // 30분 비활성
    try {
      session.term.kill();
      terminals.delete(socketId);
      console.log(`Inactive terminal ${socketId} cleaned up`);
    } catch (error) {
      console.error('Terminal cleanup error:', error);
    }
  }
}
  }, 5 * 60 * 1000);
};