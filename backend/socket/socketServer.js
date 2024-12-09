module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("joinProject", (projectId) => {
      socket.join(projectId); // 프로젝트 방에 참여
      console.log(`Client ${socket.id} joined project ${projectId}`);
    });

    socket.on("codeChange", ({ projectId, code }) => {
      console.log(`Code updated in project ${projectId}:`, code);
      // 같은 방에 있는 다른 클라이언트들에게 코드 변경 사항 전송
      socket.to(projectId).emit("codeUpdate", { code });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
};