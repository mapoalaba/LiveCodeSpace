module.exports = (io) => {
  const projectClients = new Map();

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
    });

    // 코드 변경 이벤트
    socket.on("codeChange", ({ fileId, content }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("codeUpdate", {
        fileId,
        content,
        senderId: socket.id
      });
    });

    // 파일 시스템 이벤트들
    socket.on("fileCreate", ({ file }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("fileTreeUpdate", { 
        type: 'create', 
        item: file 
      });
    });

    socket.on("folderCreate", ({ folder }) => {
      if (!socket.currentProject) return;
      socket.to(socket.currentProject).emit("fileTreeUpdate", { 
        type: 'create', 
        item: folder 
      });
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
    });
  });
};