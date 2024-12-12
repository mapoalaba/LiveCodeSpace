// terminalController.js
const AWS = require('aws-sdk');
const path = require('path');
const ContainerManager = require('./containerManager');
const EventEmitter = require('events');

class TerminalController extends EventEmitter {
    constructor() {
        super();
        this.s3 = new AWS.S3();
        this.dynamodb = new AWS.DynamoDB.DocumentClient();
        this.sessions = new Map();
        this.containerManager = ContainerManager;
    }

    async createTerminalSession(projectId, socket) {
        console.log(`Creating terminal session for project ${projectId}`);
        
        try {
            // 프로젝트 파일 존재 여부 확인
            await this.verifyProjectFiles(projectId);
            
            // 터미널 세션 생성
            const stream = await this.containerManager.createTerminalSession(projectId, socket.id);
            
            // 세션 정보 저장
            this.sessions.set(socket.id, {
                projectId,
                stream,
                socket,
                lastActivity: Date.now()
            });

            // 스트림 이벤트 핸들링
            this.handleStreamEvents(stream, socket);

            // 소켓 이벤트 핸들링
            this.handleSocketEvents(socket, projectId);

            return this.sessions.get(socket.id);
        } catch (error) {
            console.error('Terminal session creation failed:', error);
            socket.emit('terminal-error', { message: error.message });
            throw error;
        }
    }

    async verifyProjectFiles(projectId) {
        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Prefix: `${projectId}/`
        };

        const data = await this.s3.listObjectsV2(params).promise();
        if (!data.Contents || data.Contents.length === 0) {
            throw new Error('Project files not found');
        }
    }

    handleStreamEvents(stream, socket) {
        stream.on('data', (data) => {
            socket.emit('terminal-output', data.toString());
        });

        stream.on('error', (error) => {
            console.error('Stream error:', error);
            socket.emit('terminal-error', { message: error.message });
        });

        stream.on('end', () => {
            socket.emit('terminal-end');
        });
    }

    handleSocketEvents(socket, projectId) {
        socket.on('terminal-input', async (data) => {
            try {
                const session = this.sessions.get(socket.id);
                if (!session) {
                    throw new Error('Session not found');
                }

                session.lastActivity = Date.now();
                session.stream.write(data);
            } catch (error) {
                console.error('Input handling failed:', error);
                socket.emit('terminal-error', { message: error.message });
            }
        });

        socket.on('terminal-resize', async ({ cols, rows }) => {
            try {
                const session = this.sessions.get(socket.id);
                if (session) {
                    await this.resizeTerminal(session, cols, rows);
                }
            } catch (error) {
                console.error('Resize failed:', error);
            }
        });

        socket.on('disconnect', () => {
            this.terminateSession(socket.id, projectId);
        });
    }

    async resizeTerminal(session, cols, rows) {
        try {
            const containerInfo = await this.containerManager.getOrCreateContainer(session.projectId);
            await containerInfo.container.resize({ h: rows, w: cols });
        } catch (error) {
            console.error('Terminal resize failed:', error);
            throw error;
        }
    }

    async executeCommand(socketId, command) {
        console.log(`Executing command for session ${socketId}: ${command}`);
        
        const session = this.sessions.get(socketId);
        if (!session) {
            throw new Error('Session not found');
        }

        try {
            session.lastActivity = Date.now();
            
            if (this.isFileSystemCommand(command)) {
                await this.handleFileSystemCommand(session, command);
            } else {
                await this.containerManager.executeCommand(
                    session.projectId,
                    command
                );
            }
        } catch (error) {
            console.error('Command execution failed:', error);
            session.socket.emit('terminal-error', { message: error.message });
            throw error;
        }
    }

    isFileSystemCommand(command) {
        const fileSystemCommands = ['ls', 'cd', 'cat', 'pwd', 'mkdir', 'touch', 'rm'];
        return fileSystemCommands.some(cmd => command.startsWith(cmd));
    }

    async handleFileSystemCommand(session, command) {
        const cmdParts = command.split(' ');
        const cmdType = cmdParts[0];
        const args = cmdParts.slice(1);

        try {
            switch (cmdType) {
                case 'ls':
                    const files = await this.listFiles(session.projectId, args[0] || '');
                    session.socket.emit('terminal-output', files.join('\n') + '\n');
                    break;

                case 'cd':
                    const newPath = await this.changeDirectory(session.projectId, args[0]);
                    session.socket.emit('terminal-output', `Changed directory to ${newPath}\n`);
                    break;

                case 'cat':
                    const content = await this.readFile(session.projectId, args[0]);
                    session.socket.emit('terminal-output', content + '\n');
                    break;

                case 'pwd':
                    const currentPath = await this.getCurrentPath(session.projectId);
                    session.socket.emit('terminal-output', currentPath + '\n');
                    break;

                case 'mkdir':
                    await this.createDirectory(session.projectId, args[0]);
                    session.socket.emit('terminal-output', `Directory ${args[0]} created\n`);
                    break;

                case 'touch':
                    await this.createFile(session.projectId, args[0]);
                    session.socket.emit('terminal-output', `File ${args[0]} created\n`);
                    break;

                case 'rm':
                    const isRecursive = args.includes('-r') || args.includes('-rf');
                    const target = args[args.length - 1];
                    await this.removeItem(session.projectId, target, isRecursive);
                    session.socket.emit('terminal-output', `Removed ${target}\n`);
                    break;

                default:
                    throw new Error('Unknown file system command');
            }
        } catch (error) {
            session.socket.emit('terminal-output', `Error: ${error.message}\n`);
        }
    }

    async listFiles(projectId, dirPath = '') {
        try {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Prefix: path.join(projectId, dirPath)
            };
            const data = await this.s3.listObjectsV2(params).promise();
            return data.Contents.map(item => {
                const name = item.Key.split('/').pop();
                return name || '../';
            });
        } catch (error) {
            throw new Error(`Failed to list files: ${error.message}`);
        }
    }

    async readFile(projectId, filePath) {
        try {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: path.join(projectId, filePath)
            };
            const data = await this.s3.getObject(params).promise();
            return data.Body.toString();
        } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    async getCurrentPath(projectId) {
        const session = this.sessions.get(projectId);
        if (!session) throw new Error('Session not found');
        return session.currentPath || '/';
    }

    async createDirectory(projectId, dirPath) {
        try {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: path.join(projectId, dirPath, '/'),
                Body: ''
            };
            await this.s3.putObject(params).promise();
        } catch (error) {
            throw new Error(`Failed to create directory: ${error.message}`);
        }
    }

    async createFile(projectId, filePath) {
        try {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: path.join(projectId, filePath),
                Body: ''
            };
            await this.s3.putObject(params).promise();
        } catch (error) {
            throw new Error(`Failed to create file: ${error.message}`);
        }
    }

    async removeItem(projectId, itemPath, isRecursive) {
        try {
            if (isRecursive) {
                const params = {
                    Bucket: process.env.S3_BUCKET_NAME,
                    Prefix: path.join(projectId, itemPath)
                };
                const data = await this.s3.listObjectsV2(params).promise();
                for (const item of data.Contents) {
                    await this.s3.deleteObject({
                        Bucket: process.env.S3_BUCKET_NAME,
                        Key: item.Key
                    }).promise();
                }
            } else {
                await this.s3.deleteObject({
                    Bucket: process.env.S3_BUCKET_NAME,
                    Key: path.join(projectId, itemPath)
                }).promise();
            }
        } catch (error) {
            throw new Error(`Failed to remove item: ${error.message}`);
        }
    }

    async terminateSession(socketId, projectId) {
        const session = this.sessions.get(socketId);
        if (!session) return;

        try {
            console.log(`Terminating session ${socketId}`);
            
            // 컨테이너 세션 정리
            await this.containerManager.terminateSession(socketId, projectId);
            
            // 세션 정리
            this.sessions.delete(socketId);
            
            console.log(`Session ${socketId} terminated successfully`);
        } catch (error) {
            console.error('Session termination failed:', error);
        }
    }

    // 세션 정리 작업 실행 (주기적으로 호출)
    async cleanup() {
        const now = Date.now();
        for (const [socketId, session] of this.sessions) {
            if (now - session.lastActivity > 30 * 60 * 1000) { // 30분 비활성
                await this.terminateSession(socketId, session.projectId);
            }
        }
    }
}

module.exports = new TerminalController();