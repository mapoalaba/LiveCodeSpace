require('dotenv').config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const fileSystemRouter = require('./routes/fileSystem');
const terminalRoutes = require('./routes/terminalRoutes');
const pty = require('node-pty');
const os = require('os');
const ProjectSyncManager = require('./services/ProjectSyncManager');
const Docker = require('dockerode');
const AWS = require('aws-sdk');
const path = require('path');

// AWS 서비스 초기화
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const docker = new Docker();

// Express 앱 및 HTTP 서버 초기화
const app = express();
const server = http.createServer(app);

// Socket.IO 설정
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  path: "/socket",  // 소켓 경로 지정
  transports: ['websocket', 'polling'],  // 전송 방식 명시
  pingTimeout: 60000,  // 핑 타임아웃 증가
  pingInterval: 25000,
  allowEIO3: true     // Engine.IO 3 허용
});

// 터미널 명령어 핸들러
const terminalCommands = {
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

      // 폴더와 파일 목록 출력
      if (data.CommonPrefixes) {
        for (const prefix of data.CommonPrefixes) {
          const folderName = prefix.Prefix.slice(normalizedPrefix.length).split('/')[0];
          if (folderName) {
            socket.emit('terminal-output', `\x1b[34m${folderName}/\x1b[0m  `);
          }
        }
      }

      if (data.Contents) {
        for (const file of data.Contents) {
          const fileName = file.Key.slice(normalizedPrefix.length).split('/')[0];
          if (fileName && !fileName.endsWith('/')) {
            socket.emit('terminal-output', `${fileName}  `);
          }
        }
      }

      socket.emit('terminal-output', '\r\n\r\n');
    } catch (error) {
      socket.emit('terminal-output', `Error: ${error.message}\r\n`);
    }
  }
};

// Docker 컨테이너 관리 클래스
class ContainerManager {
  constructor() {
    this.containers = new Map();
    this.terminals = new Map();
  }

  async getOrCreateContainer(projectId) {
    console.log(`[Docker] Getting or creating container for project: ${projectId}`);
    
    let containerInfo = this.containers.get(projectId);
    
    if (!containerInfo) {
      console.log(`[Docker] Creating new container for project: ${projectId}`);
      
      const container = await docker.createContainer({
        Image: 'node:latest',
        name: `project-${projectId}`,
        Env: [`PROJECT_ID=${projectId}`],
        Tty: true,
        OpenStdin: true,
        Cmd: ["/bin/bash"],
        WorkingDir: `/app/${projectId}`,
        HostConfig: {
          Binds: [`/workspace/${projectId}:/app/${projectId}`],
          Memory: 2 * 1024 * 1024 * 1024,
          NanoCPUs: 2 * 1000000000,
          PortBindings: {
            '3000/tcp': [{ HostPort: '' }],
            '3001/tcp': [{ HostPort: '' }]
          }
        }
      });

      await container.start();
      
      containerInfo = {
        container,
        sessions: new Map(),
        lastActivity: Date.now(),
        projectId
      };
      
      this.containers.set(projectId, containerInfo);
      await this.initializeDevEnvironment(container, projectId);
    }

    return containerInfo;
  }

  // 개발 환경 초기화
  async initializeDevEnvironment(container, projectId) {
    console.log(`[Docker] Initializing dev environment for project: ${projectId}`);
    
    const setupCommands = [
      'npm config set prefix "/app/.npm-global"',
      'export PATH="/app/.npm-global/bin:$PATH"',
      'npm install -g nodemon ts-node typescript'
    ];

    for (const cmd of setupCommands) {
      await this.executeCommand(container, cmd);
    }
  }

  // 명령어 실행
  async executeCommand(container, command) {
    console.log(`[Docker] Executing command: ${command}`);
    
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });
    
    return await exec.start();
  }

  // 터미널 세션 생성
  async createTerminalSession(projectId, socketId) {
    console.log(`[Docker] Creating terminal session for project: ${projectId}, socket: ${socketId}`);
    
    const containerInfo = await this.getOrCreateContainer(projectId);
    
    const exec = await containerInfo.container.exec({
      Cmd: ['/bin/bash'],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: true,
      Tty: true
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true
    });

    containerInfo.terminals.set(socketId, {
      stream,
      exec,
      lastActivity: Date.now()
    });

    return stream;
  }

  // 비활성 컨테이너 정리
  async cleanup() {
    console.log('[Docker] Starting container cleanup');
    
    const now = Date.now();
    for (const [projectId, containerInfo] of this.containers) {
      if (now - containerInfo.lastActivity > 30 * 60 * 1000) { // 30분 비활성
        console.log(`[Docker] Cleaning up inactive container for project: ${projectId}`);
        await containerInfo.container.stop();
        await containerInfo.container.remove();
        this.containers.delete(projectId);
      }
    }
  }
}

// 에러 나면 이부분 -----------------------------------------------------------

// Socket.IO 설정
const socketServer = require('./socket/socketServer');
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  path: "/socket",  // 소켓 경로 지정
  transports: ['websocket', 'polling'],  // 전송 방식 명시
  pingTimeout: 60000,  // 핑 타임아웃 증가
  pingInterval: 25000,
  allowEIO3: true     // Engine.IO 3 허용
});

// 에러 나면 이부분 -----------------------------------------------------------

socketServer(io);  // Socket.IO 서버 초기화

// ===== 미들웨어 설정 =====
app.use(cors()); // CORS 활성화
app.use(bodyParser.json()); // JSON 요청 파싱
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded 요청 파싱

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// 라우트 설정
app.get("/", (req, res) => {
  res.send("LiveCodeSpace Backend API is running.");
});

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use('/api/filesystem', fileSystemRouter);
app.use('/api/terminal', terminalRoutes);


// // 터미널 세션 저장소
// const terminals = new Map();

// // Socket.IO 이벤트 처리
// io.on("connection", (socket) => {
//   console.log(`Client connected: ${socket.id}`);

//   // 프로젝트 방에 참여
//   socket.on("joinProject", (projectId) => {
//     socket.join(projectId);
//     console.log(`[Socket.IO] User ${socket.id} joined project room: ${projectId}`);
//   });

//   // 코드 변경 이벤트 처리
//   socket.on("codeChange", ({ projectId, code }) => {
//     console.log(`[Socket.IO] Code update for project ${projectId}:`, code);
//     // 프로젝트 방에 있는 다른 사용자들에게 코드 업데이트 브로드캐스트
//     socket.broadcast.to(projectId).emit("codeUpdate", { code });
//   });

//   // 터미널 세션 생성
//   socket.on('join-terminal', async ({ projectId }) => {
//     try {
//       console.log(`Creating terminal for project: ${projectId}`);
      
//       // 기존 세션이 있다면 정리
//       if (terminals.has(socket.id)) {
//         const existingSession = terminals.get(socket.id);
//         if (existingSession.term) {
//           existingSession.term.kill();
//         }
//         terminals.delete(socket.id);
//       }

//       // 새 터미널 세션 생성
//       let session = {
//         projectId,
//         currentPath: `/${projectId}`,
//         currentCommand: '',
//         lastActivity: Date.now()
//       };
      
//       terminals.set(socket.id, session);
//       console.log(`Terminal session created for socket ${socket.id}`);

//       // 초기 프롬프트 전송
//       socket.emit('terminal-output', `${session.currentPath} $ `);
      
//       socket.join(`terminal-${projectId}`);
//     } catch (error) {
//       console.error('Terminal creation error:', error);
//       socket.emit('terminal-error', { error: error.message });
//     }
//   });

//   // 터미널 입력 처리
//   socket.on('terminal-input', async ({ projectId, data }) => {
//     try {
//       let session = terminals.get(socket.id);
//       if (!session) {
//         session = {
//           projectId,
//           currentPath: `/${projectId}`,
//           currentCommand: '',
//           lastActivity: Date.now()
//         };
//         terminals.set(socket.id, session);
//       }
  
//       session.lastActivity = Date.now();
  
//       if (data === '\r' || data === '\n') {
//         const commandLine = session.currentCommand.trim();
//         const [command, ...args] = commandLine.split(' ');
  
//         if (command && commands[command]) {
//           await commands[command](session, socket, args);
//         } else if (command) {
//           socket.emit('terminal-output', '\r\nCommand not found. Type "help" for available commands\r\n\r\n');
//         }
  
//         session.currentCommand = '';
//         socket.emit('terminal-output', `${session.currentPath}$ `);
//       } else if (data === '\b' || data === '\x7f') {
//         if (session.currentCommand.length > 0) {
//           session.currentCommand = session.currentCommand.slice(0, -1);
//           socket.emit('terminal-output', '\b \b');
//         }
//       } else {
//         session.currentCommand += data;
//         socket.emit('terminal-output', data);
//       }
//     } catch (error) {
//       console.error('Terminal input error:', error);
//       socket.emit('terminal-error', { error: error.message });
//     }
//   });
  
//   // 디버깅을 위한 추가 이벤트 리스너
//   socket.on('error', (error) => {
//     console.error('Socket error:', error);
//   });
  
//   socket.on('disconnect', () => {
//     console.log('Client disconnected:', socket.id);
//     const session = terminals.get(socket.id);
//     if (session) {
//       terminals.delete(socket.id);
//     }
//   });

//   // 터미널 크기 조정
//   socket.on('terminal-resize', ({ cols, rows }) => {
//     try {
//       const session = terminals.get(socket.id);
//       if (session && session.term) {
//         session.term.resize(cols, rows);
//       }
//     } catch (error) {
//       console.error('Terminal resize error:', error);
//     }
//   });

//   // 연결 해제 처리
//   socket.on("disconnect", () => {
//     try {
//       console.log(`Client disconnected: ${socket.id}`);
//       const session = terminals.get(socket.id);
//       if (session) {
//         terminals.delete(socket.id);
//       }
//     } catch (error) {
//       console.error('Disconnect cleanup error:', error);
//     }
//   });
// });

// // 비활성 터미널 정리
// setInterval(() => {
//   const now = Date.now();
//   for (const [socketId, session] of terminals.entries()) {
//     if (now - session.lastActivity > 1000 * 60 * 30) { // 30분 비활성
//       try {
//         session.term.kill();
//         terminals.delete(socketId);
//         console.log(`Inactive terminal ${socketId} cleaned up`);
//       } catch (error) {
//         console.error('Terminal cleanup error:', error);
//       }
//     }
//   }
// }, 1000 * 60 * 5); // 5분마다 체크

// 주기적인 정리 작업 설정
setInterval(() => {
  containerManager.cleanup();
  // 오래된 캐시 정리
  ProjectSyncManager.cleanup();
}, 1000 * 60 * 30); // 30분마다

// 에러 핸들링
app.use((req, res, next) => {
  console.warn(`[HTTP] 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, next) => {
  console.error(`[HTTP] 500 - Server error:`, err);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// 서버 시작
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  console.log('[Server] Socket.IO initialized');
  console.log('[Server] Docker service ready');
  console.log('[Server] Waiting for client connections...');
});