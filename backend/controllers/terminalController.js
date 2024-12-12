// backend/controllers/terminalController.js
const AWS = require('aws-sdk');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const docker = require('dockerode')();

class TerminalController {
    constructor() {
        this.s3 = new AWS.S3();
        this.dynamodb = new AWS.DynamoDB.DocumentClient();
        this.sessions = new Map();
        this.docker = docker;
    }

    async createTerminalSession(projectId, socket) {
        try {
            // S3에서 프로젝트 정보 조회
            const projectFiles = await this.getProjectFilesFromS3(projectId);
            
            // Docker 컨테이너 생성 
            const container = await this.docker.createContainer({
                Image: 'ubuntu:latest',
                Cmd: ['/bin/bash'],
                Tty: true,
                OpenStdin: true,
                WorkingDir: '/workspace',
                Env: [
                    'TERM=xterm-256color',
                    `PROJECT_ID=${projectId}`
                ],
                HostConfig: {
                    Memory: 512 * 1024 * 1024, // 512MB
                    MemorySwap: 1024 * 1024 * 1024, // 1GB
                    CpuShares: 512,
                    Binds: [`${process.env.PROJECT_MOUNT_PATH}/${projectId}:/workspace`]
                }
            });

            await container.start();

            // PTY 프로세스 생성
            const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
            const term = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: '/workspace',
                env: process.env
            });

            // 세션 저장
            const session = {
                container,
                term,
                socket
            };
            this.sessions.set(socket.id, session);

            // 터미널 출력 처리
            term.onData(data => {
                socket.emit('terminal-output', data);
            });

            // 컨테이너 로그 스트리밍
            const logStream = await container.logs({
                follow: true,
                stdout: true,
                stderr: true
            });
            logStream.on('data', chunk => {
                socket.emit('terminal-output', chunk.toString());
            });

            return session;
        } catch (error) {
            console.error('Terminal session creation failed:', error);
            throw error;
        }
    }

    async executeCommand(socketId, command) {
        const session = this.sessions.get(socketId);
        if (!session) {
            throw new Error('Terminal session not found');
        }

        try {
            const { container, term } = session;

            // 명령어 실행
            const exec = await container.exec({
                Cmd: ['bash', '-c', command],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true
            });

            // 실행 결과 스트리밍
            const stream = await exec.start();
            stream.on('data', chunk => {
                term.write(chunk.toString());
            });

            return new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });
        } catch (error) {
            console.error('Command execution failed:', error);
            throw error;
        }
    }

    async terminateSession(socketId) {
        const session = this.sessions.get(socketId);
        if (!session) return;

        try {
            const { container, term } = session;
            
            // 컨테이너 정지 및 제거
            await container.stop();
            await container.remove();

            // PTY 프로세스 종료
            term.kill();
            
            // 세션 제거
            this.sessions.delete(socketId);
        } catch (error) {
            console.error('Session termination failed:', error);
            throw error;
        }
    }

    // S3 파일 시스템 연동
    async getProjectFilesFromS3(projectId) {
        try {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Prefix: `${projectId}/`
            };
            const data = await this.s3.listObjectsV2(params).promise();
            return data.Contents;
        } catch (error) {
            console.error('Failed to get project files:', error);
            throw error;
        }
    }

    // 파일 시스템 명령어 처리
    async handleFileSystemCommand(socketId, command) {
        const session = this.sessions.get(socketId);
        if (!session) throw new Error('Session not found');

        const { term } = session;
        
        try {
            switch (command.type) {
                case 'ls':
                    const files = await this.listFiles(command.path);
                    term.write(files.join('\n') + '\n');
                    break;
                    
                case 'cd':
                    await this.changeDirectory(command.path);
                    term.write(`Changed directory to ${command.path}\n`);
                    break;
                    
                case 'cat':
                    const content = await this.readFile(command.path);
                    term.write(content + '\n');
                    break;
                    
                default:
                    await this.executeCommand(socketId, command.raw);
            }
        } catch (error) {
            term.write(`Error: ${error.message}\n`);
        }
    }
}

module.exports = new TerminalController();