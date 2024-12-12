// backend/services/CollaborationManager.js

class CollaborationManager {
  constructor() {
    this.activeUsers = new Map(); // projectId -> Map<userId, userInfo>
    this.userSockets = new Map(); // socketId -> { userId, projectId }
  }

  handleConnection(socket, io) {
    // 편집기 참여
    socket.on('join-editor', ({ projectId, filepath, userId, username }) => {
      this.addUser(socket.id, projectId, userId, username);
      socket.join(`${projectId}:${filepath}`);

      // 현재 활성 사용자 정보 전송
      const activeUsers = Array.from(this.getProjectUsers(projectId).values());
      socket.emit('active-users', activeUsers);

      // 다른 사용자들에게 새 사용자 알림
      socket.to(`${projectId}:${filepath}`).emit('user-joined', {
        userId,
        username
      });
    });

    // 커서 위치 업데이트
    socket.on('cursor-move', ({ projectId, filepath, position }) => {
      const userInfo = this.userSockets.get(socket.id);
      if (!userInfo) return;

      const { userId, username } = userInfo;
      
      // 같은 파일을 보고 있는 다른 사용자들에게 전파
      socket.to(`${projectId}:${filepath}`).emit('cursor-update', {
        userId,
        username,
        position
      });

      // 사용자 상태 업데이트
      this.updateUserState(projectId, userId, { position });
    });

    // 선택 영역 업데이트
    socket.on('selection-change', ({ projectId, filepath, selection }) => {
      const userInfo = this.userSockets.get(socket.id);
      if (!userInfo) return;

      const { userId, username } = userInfo;
      
      socket.to(`${projectId}:${filepath}`).emit('cursor-update', {
        userId,
        username,
        selection
      });

      this.updateUserState(projectId, userId, { selection });
    });

    // 연결 종료
    socket.on('disconnect', () => {
      const userInfo = this.userSockets.get(socket.id);
      if (!userInfo) return;

      const { projectId, userId } = userInfo;
      this.removeUser(socket.id, projectId, userId);

      // 다른 사용자들에게 알림
      io.to(projectId).emit('user-left', { userId });
    });
  }

  addUser(socketId, projectId, userId, username) {
    if (!this.activeUsers.has(projectId)) {
      this.activeUsers.set(projectId, new Map());
    }

    const projectUsers = this.activeUsers.get(projectId);
    projectUsers.set(userId, { userId, username, socketId });
    this.userSockets.set(socketId, { userId, projectId, username });
  }

  removeUser(socketId, projectId, userId) {
    this.userSockets.delete(socketId);
    const projectUsers = this.activeUsers.get(projectId);
    if (projectUsers) {
      projectUsers.delete(userId);
      if (projectUsers.size === 0) {
        this.activeUsers.delete(projectId);
      }
    }
  }

  getProjectUsers(projectId) {
    return this.activeUsers.get(projectId) || new Map();
  }

  updateUserState(projectId, userId, state) {
    const projectUsers = this.getProjectUsers(projectId);
    const userInfo = projectUsers.get(userId);
    if (userInfo) {
      projectUsers.set(userId, { ...userInfo, ...state });
    }
  }
}

module.exports = new CollaborationManager();