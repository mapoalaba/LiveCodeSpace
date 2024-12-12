require('dotenv').config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const fileSystemRouter = require('./routes/fileSystem');
const ProjectSyncManager = require('./services/ProjectSyncManager');
const Docker = require('dockerode');
const AWS = require('aws-sdk');
const path = require('path');

// AWS 서비스 초기화
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const docker = new Docker();
const socketServer = require('./socket/socketServer');

// Express 앱 및 HTTP 서버 초기화
const app = express();
const server = http.createServer(app);

// Docker 컨테이너 관리 클래스
class ContainerManager {
  constructor() {
    this.containers = new Map();
    this.terminals = new Map();
  }
  
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

  // 컨테이너 생성 또는 가져오기
  async getOrCreateContainer(projectId) {
    console.log(`[Docker] Getting or creating container for project: ${projectId}`);
    
    let containerInfo = this.containers.get(projectId);
    
    if (!containerInfo) {
      console.log(`[Docker] Creating new container for project: ${projectId}`);
      
      // 새 컨테이너 생성
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
          Memory: 2 * 1024 * 1024 * 1024, // 2GB
          NanoCPUs: 2 * 1000000000, // 2 CPU cores
          PortBindings: {
            '3000/tcp': [{ HostPort: '' }], // React 개발 서버
            '3001/tcp': [{ HostPort: '' }]  // 추가 포트
          }
        }
      });

      await container.start();
      console.log(`[Docker] Container started for project: ${projectId}`);
      
      // 컨테이너 정보 저장
      containerInfo = {
        container,
        terminals: new Map(),
        lastActivity: Date.now()
      };
      
      this.containers.set(projectId, containerInfo);
      
      // 기본 개발 환경 설정
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

// 컨테이너 매니저 인스턴스 생성
const containerManager = new ContainerManager();

socketServer(io);  // Socket.IO 서버 초기화

// Express 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Socket.IO 이벤트 처리
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  
  // 프로젝트 참여
  socket.on("joinProject", async (projectId) => {
    try {
      console.log(`[Socket] User ${socket.id} joining project: ${projectId}`);
      
      // 프로젝트 초기화 및 동기화
      await ProjectSyncManager.initializeProject(projectId);
      
      socket.join(projectId);
      console.log(`[Socket] User ${socket.id} joined project: ${projectId}`);

      // 프로젝트 상태 전송
      const containerInfo = containerManager.containers.get(projectId);
      if (containerInfo) {
        socket.emit('project-status', {
          isRunning: true,
          ports: containerInfo.ports
        });
      }
    } catch (error) {
      console.error('[Project] Join error:', error);
      socket.emit('project-error', { error: error.message });
    }
  });

  // 터미널 세션 생성
  socket.on('join-terminal', async ({ projectId }) => {
    console.log(`[Terminal] Creating terminal session for project: ${projectId}`);
    
    try {
      // 컨테이너 및 터미널 세션 생성
      const containerInfo = await containerManager.getOrCreateContainer(projectId);
      const stream = await containerManager.createTerminalSession(projectId, socket.id);

      // 스트림 데이터 처리
      stream.on('data', (data) => {
        socket.emit('terminal-output', data.toString());
      });

      stream.on('error', (error) => {
        console.error('[Terminal] Stream error:', error);
        socket.emit('terminal-error', { error: error.message });
      });

      stream.on('end', () => {
        console.log(`[Terminal] Stream ended for socket: ${socket.id}`);
        socket.emit('terminal-end');
      });

      // 터미널 크기 초기화
      containerManager.resizeTerminal(projectId, socket.id, 80, 24);

      console.log(`[Terminal] Terminal session created for socket: ${socket.id}`);
    } catch (error) {
      console.error('[Terminal] Session creation error:', error);
      socket.emit('terminal-error', { error: error.message });
    }
  });

  // 터미널 입력 처리
  socket.on('terminal-input', async ({ projectId, data }) => {
    try {
      const containerInfo = containerManager.containers.get(projectId);
      if (!containerInfo) {
        throw new Error('Container not found');
      }

      const session = containerInfo.sessions.get(socket.id);
      if (!session || !session.stream) {
        throw new Error('Terminal session not found');
      }

      // 입력 처리 전 세션 활성 시간 업데이트
      session.lastActivity = Date.now();
      containerInfo.lastActivity = Date.now();

      // 특수 명령어 처리
      if (data === '\f') { // Ctrl+L: 화면 클리어
        socket.emit('terminal-clear');
        return;
      }

      // 일반 입력 처리
      session.stream.write(data);

    } catch (error) {
      console.error('[Terminal] Input error:', error);
      socket.emit('terminal-error', { error: error.message });
    }
  });

  // 터미널 크기 조정
  socket.on('terminal-resize', async ({ projectId, cols, rows }) => {
    try {
      await containerManager.resizeTerminal(projectId, socket.id, cols, rows);
    } catch (error) {
      console.error('[Terminal] Resize error:', error);
    }
  });

  // React 개발 서버 명령어 처리
  socket.on('start-react-server', async ({ projectId }) => {
    try {
      const containerInfo = await containerManager.getOrCreateContainer(projectId);
      if (!containerInfo) throw new Error('Container not found');

      // 이미 실행 중인 React 서버 확인
      const processes = await containerManager.listProcesses(containerInfo.container);
      const isRunning = processes.some(proc => proc.includes('react-scripts start'));

      if (!isRunning) {
        // React 서버 시작
        await containerManager.executeCommand(
          containerInfo.container,
          'cd /app/${projectId} && npm start'
        );
      }

      // 포트 정보 가져오기
      const data = await containerInfo.container.inspect();
      const port = data.NetworkSettings.Ports['3000/tcp']?.[0]?.HostPort;

      if (!port) {
        throw new Error('React server port not found');
      }

      socket.emit('react-server-started', {
        url: `http://${process.env.EC2_PUBLIC_IP}:${port}`
      });
    } catch (error) {
      console.error('[React] Server start error:', error);
      socket.emit('terminal-error', { error: error.message });
    }
  });

  // 파일 변경 이벤트
  socket.on('file-change', async ({ projectId, path, content }) => {
    try {
      await ProjectSyncManager.handleFileChange(projectId, path, content);
      
      // 같은 프로젝트의 다른 사용자들에게 알림
      socket.to(projectId).emit('file-changed', { path });
    } catch (error) {
      console.error('[File] Change error:', error);
      socket.emit('file-error', { error: error.message });
    }
  });

  // 연결 해제 처리
  socket.on("disconnect", async () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    
    try {
      // 모든 프로젝트의 터미널 세션 정리
      for (const [projectId, containerInfo] of containerManager.containers) {
        const session = containerInfo.sessions.get(socket.id);
        if (session) {
          // 터미널 세션 정리
          await containerManager.terminateSession(socket.id, projectId);
          
          // 프로젝트의 다른 활성 세션이 없으면 변경사항 동기화
          const activeSessions = Array.from(containerInfo.sessions.values())
            .filter(s => s.socket.connected);
          
          if (activeSessions.length === 0) {
            await ProjectSyncManager.syncProject(projectId);
          }
        }
      }
    } catch (error) {
      console.error('[Disconnect] Cleanup error:', error);
    }
  });
});

// 컨테이너 정리 작업 스케줄링
setInterval(() => {
  containerManager.cleanup()
    .catch(error => console.error('[Docker] Cleanup error:', error));
}, 1000 * 60 * 5); // 5분마다 체크

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