require("dotenv").config(); // 환경 변수 설정
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // 프론트엔드 URL
    methods: ["GET", "POST", "PUT"],
  },
});

// ===== 미들웨어 설정 =====
app.use(cors()); // CORS 활성화
app.use(bodyParser.json()); // JSON 요청 파싱
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded 요청 파싱

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

// ===== Socket.IO 이벤트 처리 =====
io.on("connection", (socket) => {
  console.log(`[Socket.IO] User connected: ${socket.id}`);

  // 프로젝트 방에 참여
  socket.on("joinProject", (projectId) => {
    socket.join(projectId);
    console.log(`[Socket.IO] User ${socket.id} joined project room: ${projectId}`);
  });

  // 코드 변경 이벤트 처리
  socket.on("codeChange", ({ projectId, code }) => {
    console.log(`[Socket.IO] Code update for project ${projectId}:`, code);
    // 프로젝트 방에 있는 다른 사용자들에게 코드 업데이트 브로드캐스트
    socket.broadcast.to(projectId).emit("codeUpdate", { code });
  });

  // 연결 해제 처리
  socket.on("disconnect", () => {
    console.log(`[Socket.IO] User disconnected: ${socket.id}`);
  });
});

// ===== 에러 핸들링 =====
// 404 핸들러
app.use((req, res, next) => {
  console.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Not Found" });
});

// 일반 에러 핸들러
app.use((err, req, res, next) => {
  console.error(`[500] Unhandled error: ${err.message}`);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// ===== 서버 시작 =====
const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Server] Running on port ${PORT}`);
});