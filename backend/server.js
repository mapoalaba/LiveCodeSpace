require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const pty = require('node-pty');
const os = require('os');
const path = require('path');

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const terminalRoutes = require('./routes/terminalRoutes');
const fileSystemRouter = require('./routes/fileSystem');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT"],
  },
});

// 터미널 세션 저장소
const terminals = new Map();

// ===== 미들웨어 설정 =====
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 요청 로깅
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ===== 기본 라우트 =====
app.get("/", (req, res) => {
  res.send("LiveCodeSpace Backend API is running.");
});

// ===== 라우트 등록 =====
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use('/api/filesystem', fileSystemRouter);
app.use('/api/terminal', terminalRoutes);

// ===== Socket.IO 이벤트 처리 =====
io.on("connection", (socket) => {
  console.log(`[Socket.IO] User connected: ${socket.id}`);

  // 프로젝트 방 참여
  socket.on("joinProject", (projectId) => {
    socket.join(projectId);
    console.log(`Client ${socket.id} joined project ${projectId}`);
  });

  // 터미널 세션 참가
  socket.on('join-terminal', async ({ projectId }) => {
    try {
      console.log('Client joined terminal:', projectId);
      
      const terminalId = `${projectId}-${socket.id}`;
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
        projectId,
        lastActivity: Date.now()
      });

      socket.join(`terminal-${projectId}`);
      console.log(`Terminal created for project ${projectId}`);
    } catch (error) {
      console.error('Terminal creation error:', error);
      socket.emit('terminal-error', { error: error.message });
    }
  });

  // 터미널 입력 처리
  socket.on('terminal-input', async ({ projectId, data }) => {
    try {
      const terminalId = `${projectId}-${socket.id}`;
      const terminal = terminals.get(terminalId);

      if (terminal && terminal.term) {
        terminal.lastActivity = Date.now();
        terminal.term.write(data);
      } else {
        throw new Error('Terminal session not found');
      }
    } catch (error) {
      console.error('Terminal input error:', error);
      socket.emit('terminal-error', { error: error.message });
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
      console.error('Terminal resize error:', error);
    }
  });

  // 코드 변경 이벤트 처리
  socket.on("codeChange", ({ projectId, code }) => {
    console.log(`[Socket.IO] Code update for project ${projectId}`);
    socket.broadcast.to(projectId).emit("codeUpdate", { code });
  });

  // 연결 해제 처리
  socket.on("disconnect", () => {
    try {
      console.log(`[Socket.IO] User disconnected: ${socket.id}`);
      
      // 해당 소켓의 모든 터미널 정리
      for (const [terminalId, terminal] of terminals.entries()) {
        if (terminalId.includes(socket.id)) {
          terminal.term.kill();
          terminals.delete(terminalId);
          console.log(`Terminal ${terminalId} cleaned up`);
        }
      }
    } catch (error) {
      console.error('Disconnect cleanup error:', error);
    }
  });
});

// ===== 에러 핸들링 =====
app.use((req, res, next) => {
  console.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, next) => {
  console.error(`[500] Unhandled error: ${err.message}`);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// 비활성 터미널 정리 작업
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
    console.error('Terminal cleanup error:', error);
  }
}, 1000 * 60 * 5); // 5분마다 체크

// ===== 서버 시작 =====
const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Socket.io server initialized');
  console.log('Terminal service ready');
  console.log('Waiting for client connections...');
});