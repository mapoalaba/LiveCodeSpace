module.exports = (io) => {
  const projectClients = new Map();
  const typingUsers = new Map();  // 타이핑 중인 사용자 관리

  const updateActiveUsers = (projectId) => {
    const clients = projectClients.get(projectId) || new Set();
    io.to(projectId).emit("activeUsers", { count: clients.size });
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

      // 현재 프로젝트의 파일 트리 상태 전송
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

    // 파일 생성
    socket.on("fileCreate", ({ file }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("fileCreated", { file });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    // 폴더 생성
    socket.on("folderCreate", ({ folder }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("folderCreated", { folder });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    // 파일/폴더 삭제
    socket.on("itemDelete", ({ itemId, itemType }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("itemDeleted", { itemId, itemType });
      io.to(socket.currentProject).emit("fileTreeUpdate");
    });

    // 타이핑 상태 이벤트 처리 수정
    socket.on("typing", ({ fileId, userName }) => {
      if (!socket.currentProject) return;
      
      // 타이핑 상태 업데이트
      const fileKey = `${socket.currentProject}:${fileId}`;
      if (!typingUsers.has(fileKey)) {
        typingUsers.set(fileKey, new Map());
      }
      const fileTypingUsers = typingUsers.get(fileKey);
      fileTypingUsers.set(socket.id, {
        userName,
        timestamp: Date.now()
      });

      // 현재 타이핑 중인 모든 사용자 목록 전송
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

    // 연결 해제
    socket.on("disconnect", () => {
      console.log("[Socket.IO] Disconnected:", socket.id);
      if (socket.currentProject) {
        const clients = projectClients.get(socket.currentProject);
        if (clients) {
          clients.delete(socket.id);
          updateActiveUsers(socket.currentProject);
        }
      }
      
      // 모든 파일에서 해당 사용자의 타이핑 상태 제거
      typingUsers.forEach((fileTypingUsers, fileKey) => {
        if (fileTypingUsers.has(socket.id)) {
          fileTypingUsers.delete(socket.id);
          const [projectId, fileId] = fileKey.split(':');
          io.to(projectId).emit("userTyping", {
            fileId,
            users: Array.from(fileTypingUsers.values()).map(u => u.userName)
          });
        }
      });
    });
  });
};