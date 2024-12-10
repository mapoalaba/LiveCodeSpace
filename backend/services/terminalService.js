// terminalService.js
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');

class TerminalService {
  constructor() {
    this.ecs = new AWS.ECS({
      region: process.env.AWS_REGION
    });
    
    this.docker = new Docker({
      socketPath: '/var/run/docker.sock'
    });
    
    this.sessions = new Map();
  }

  async createTerminalSession(userId, projectId) {
    const sessionId = uuidv4();
    
    // ECS Task 정의에 따라 컨테이너 실행
    const params = {
      cluster: process.env.ECS_CLUSTER,
      taskDefinition: process.env.TERMINAL_TASK_DEFINITION,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [process.env.SUBNET_ID],
          securityGroups: [process.env.SECURITY_GROUP_ID],
          assignPublicIp: 'ENABLED'
        }
      },
      tags: [
        {
          key: 'SessionId',
          value: sessionId
        },
        {
          key: 'UserId',
          value: userId
        },
        {
          key: 'ProjectId',
          value: projectId
        }
      ]
    };

    const task = await this.ecs.runTask(params).promise();
    
    // 세션 정보 저장
    this.sessions.set(sessionId, {
      taskArn: task.tasks[0].taskArn,
      userId,
      projectId,
      createdAt: new Date(),
      containerInstance: task.tasks[0].containerInstanceArn
    });

    return sessionId;
  }

  async executeCode(sessionId, code, language) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // 컨테이너 내에서 코드 실행
    const container = await this.docker.getContainer(session.containerId);
    
    // 언어별 실행 명령어 설정
    const execCommand = this.getExecCommand(language, code);
    
    const exec = await container.exec({
      Cmd: execCommand,
      AttachStdout: true,
      AttachStderr: true
    });

    return new Promise((resolve, reject) => {
      exec.start(async (err, stream) => {
        if (err) reject(err);
        
        let output = '';
        stream.on('data', (chunk) => {
          output += chunk.toString();
        });
        
        stream.on('end', () => {
          resolve(output);
        });
      });
    });
  }

  getExecCommand(language, code) {
    const commands = {
      javascript: ['node', '-e', code],
      python: ['python3', '-c', code],
      // 다른 언어들 추가 가능
    };
    
    return commands[language] || ['sh', '-c', code];
  }

  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // ECS Task 종료
    await this.ecs.stopTask({
      cluster: process.env.ECS_CLUSTER,
      task: session.taskArn,
      reason: 'Session cleanup'
    }).promise();

    this.sessions.delete(sessionId);
  }
}

module.exports = new TerminalService();