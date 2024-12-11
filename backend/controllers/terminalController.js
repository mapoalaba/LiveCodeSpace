// backend/controllers/terminalController.js
const AWS = require('aws-sdk');
const { exec } = require('child_process');
const docker = new require('dockerode')();

class TerminalController {
    constructor() {
        this.s3 = new AWS.S3();
        this.dynamoDB = new AWS.DynamoDB.DocumentClient();
    }

    async createContainer(projectId) {
        try {
            // 프로젝트의 파일들을 S3에서 가져오기
            const files = await this.getProjectFiles(projectId);
            
            // Docker 컨테이너 생성
            const container = await docker.createContainer({
                Image: 'node:latest', // 기본 이미지로 Node.js 사용
                Cmd: ['/bin/bash'],
                Tty: true,
                OpenStdin: true,
                WorkingDir: '/app',
                HostConfig: {
                    Memory: 512 * 1024 * 1024, // 512MB 메모리 제한
                    CpuShares: 512,
                }
            });

            // 컨테이너 시작
            await container.start();

            // S3의 파일들을 컨테이너에 복사
            await this.copyFilesToContainer(container.id, files);

            return container.id;
        } catch (error) {
            console.error('Container creation failed:', error);
            throw error;
        }
    }

    async executeCommand(containerId, command) {
        try {
            // 커맨드 실행 전 컨테이너 ID 가져오기
            const containerId = await this.getContainerIdForProject(projectId);
            if (!containerId) {
                // 컨테이너가 없으면 새로 생성
                await this.createContainer(projectId);
            }
    
            // Docker 컨테이너에서 명령어 실행
            const container = docker.getContainer(containerId);
            const exec = await container.exec({
                Cmd: ['bash', '-c', command],
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Tty: true
            });

            return new Promise((resolve, reject) => {
                exec.start({hijack: true}, (err, stream) => {
                    if (err) return reject(err);
                    
                    let output = '';
                    stream.on('data', chunk => {
                        output += chunk.toString();
                    });
                    
                    stream.on('end', () => {
                        resolve(output);
                    });
                    
                    stream.on('error', err => {
                        reject(err);
                    });
                });
            });
        } catch (error) {
            console.error('Command execution failed:', error);
            throw error;
        }
    }

    async saveFileChanges(projectId, filePath, content) {
        try {
            // S3에 파일 저장
            await this.s3.putObject({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: `${projectId}/${filePath}`,
                Body: content
            }).promise();

            // DynamoDB에 메타데이터 업데이트
            await this.dynamoDB.update({
                TableName: 'ProjectFiles',
                Key: { projectId, filePath },
                UpdateExpression: 'set lastModified = :now',
                ExpressionAttributeValues: {
                    ':now': new Date().toISOString()
                }
            }).promise();
        } catch (error) {
            console.error('Failed to save file changes:', error);
            throw error;
        }
    }
}

module.exports = new TerminalController();