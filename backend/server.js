// server.js
require('dotenv').config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const fileSystemRouter = require('./routes/fileSystem');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const app = express();
const server = http.createServer(app);

// 터미널 명령어 핸들러
const commands = {
  async pwd(session, socket) {
    socket.emit('terminal-output', '\r\n');
    socket.emit('terminal-output', session.currentPath);
    socket.emit('terminal-output', '\r\n\r\n');
  },

  async ls(session, socket, args) {
    try {
      // 현재 경로에서 마지막 슬래시 확인하고 정규화
      const currentPrefix = session.currentPath.slice(1);  // 앞의 '/' 제거
      const normalizedPrefix = currentPrefix.endsWith('/') ? currentPrefix : `${currentPrefix}/`;

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: normalizedPrefix,
        Delimiter: '/'
      };

      const data = await s3.listObjectsV2(params).promise();
      socket.emit('terminal-output', '\r\n');

      let hasContent = false;

      // 폴더 목록 (CommonPrefixes)
      if (data.CommonPrefixes && data.CommonPrefixes.length > 0) {
        for (const prefix of data.CommonPrefixes) {
          // 현재 경로의 직계 하위 폴더만 표시
          const folderName = prefix.Prefix.slice(normalizedPrefix.length).split('/')[0];
          if (folderName) {
            socket.emit('terminal-output', `\x1b[34m${folderName}/\x1b[0m  `);
            hasContent = true;
          }
        }
      }

      // 파일 목록 (Contents)
      if (data.Contents) {
        for (const content of data.Contents) {
          // 현재 폴더의 파일만 표시 (하위 폴더 내용 제외)
          const relativePath = content.Key.slice(normalizedPrefix.length);
          const fileName = relativePath.split('/')[0];
          if (fileName && !content.Key.endsWith('/')) {
            socket.emit('terminal-output', `${fileName}  `);
            hasContent = true;
          }
        }
      }

      // 내용이 없을 경우 메시지 표시
      if (!hasContent) {
        socket.emit('terminal-output', 'Empty directory');
      }

      socket.emit('terminal-output', '\r\n\r\n');
    } catch (error) {
      socket.emit('terminal-output', `\r\nError: ${error.message}\r\n\r\n`);
    }
  },

  async cd(session, socket, args) {
    try {
      socket.emit('terminal-output', '\r\n'); // 명령어 입력 후 줄바꿈

      if (!args[0] || args[0] === '/') {
        session.currentPath = `/${session.projectId}`;
        socket.emit('terminal-output', '\r\n');
        return;
      }

      let newPath;
      if (args[0].startsWith('/')) {
        newPath = args[0];
      } else if (args[0] === '..') {
        const parts = session.currentPath.split('/').filter(Boolean);
        parts.pop();
        newPath = '/' + parts.join('/');
      } else {
        newPath = `${session.currentPath}/${args[0]}`.replace(/\/+/g, '/');
      }

      // S3에서 경로 확인
      const prefix = newPath.slice(1);
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: prefix,
        Delimiter: '/',
        MaxKeys: 1
      };

      const data = await s3.listObjectsV2(params).promise();
      
      if (data.CommonPrefixes.length > 0 || data.Contents.length > 0) {
        session.currentPath = newPath;
        socket.emit('terminal-output', '\r\n');
      } else {
        socket.emit('terminal-output', 'Directory not found\r\n\r\n');
      }
    } catch (error) {
      socket.emit('terminal-output', `Error: ${error.message}\r\n\r\n`);
    }
  },

  async cat(session, socket, args) {
    try {
      socket.emit('terminal-output', '\r\n'); // 명령어 입력 후 줄바꿈

      if (!args[0]) {
        socket.emit('terminal-output', 'Usage: cat <filename>\r\n\r\n');
        return;
      }

      const filePath = args[0].startsWith('/')
        ? args[0].slice(1)
        : `${session.currentPath.slice(1)}/${args[0]}`;

      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: filePath
      };

      const data = await s3.getObject(params).promise();
      socket.emit('terminal-output', data.Body.toString('utf-8'));
      socket.emit('terminal-output', '\r\n\r\n');
    } catch (error) {
      socket.emit('terminal-output', `Error: ${error.message}\r\n\r\n`);
    }
  }
};

// Socket.IO 설정
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT"],
    credentials: true
  }
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

// API 라우트 등록
app.use(express.json());

// ===== 라우트 등록 =====
app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use('/api/filesystem', fileSystemRouter);

// 터미널 세션 저장소
const terminals = new Map();

// Socket.IO 이벤트 처리
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

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
}, 1000 * 60 * 5); // 5분마다 체크

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


// 서버 시작
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Socket.io server initialized');
  console.log('Terminal service ready');
  console.log('Waiting for client connections...');
});