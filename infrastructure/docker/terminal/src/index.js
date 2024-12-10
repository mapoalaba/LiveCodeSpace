// infrastructure/docker/terminal/src/index.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const Docker = require('dockerode');

// 서비스 초기화
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Docker 클라이언트 초기화
const docker = new Docker({
  socketPath: '/var/run/docker.sock'
});

// 세션 관리
const sessions = new Map();

// 컨테이너 생성 함수
async function createContainer(sessionId) {
  const container = await docker.createContainer({
    Image: 'terminal-env:latest',
    Tty: true,
    OpenStdin: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Env: [
      `SESSION_ID=${sessionId}`,
      `AWS_ACCESS_KEY_ID=${process.env.AWS_ACCESS_KEY_ID}`,
      `AWS_SECRET_ACCESS_KEY=${process.env.AWS_SECRET_ACCESS_KEY}`,
      `AWS_REGION=${process.env.AWS_REGION}`
    ],
    WorkingDir: '/workspace',
    HostConfig: {
      AutoRemove: true,
      SecurityOpt: ['no-new-privileges'],
      Memory: 512 * 1024 * 1024, // 512MB 메모리 제한
      MemorySwap: 512 * 1024 * 1024
    }
  });

  await container.start();
  return container;
}

// WebSocket 연결 처리
wss.on('connection', async (ws) => {
  try {
    const sessionId = Math.random().toString(36).substring(7);
    const container = await createContainer(sessionId);
    
    const exec = await container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true
    });

    // 컨테이너에서 터미널로 데이터 전송
    stream.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data.toString());
      }
    });

    // 터미널에서 컨테이너로 데이터 전송
    ws.on('message', (data) => {
      if (stream.writable) {
        stream.write(data);
      }
    });

    // 연결 종료 처리
    ws.on('close', async () => {
      try {
        await container.stop();
      } catch (error) {
        console.error('Error stopping container:', error);
      }
    });

    // 세션 저장
    sessions.set(sessionId, {
      container,
      stream,
      ws
    });

  } catch (error) {
    console.error('Terminal session error:', error);
    ws.close();
  }
});

// 기본 라우트
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`Terminal service running on port ${PORT}`);
});