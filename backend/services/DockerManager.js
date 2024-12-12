// backend/services/DockerManager.js

const Docker = require('dockerode');
const ProjectFileManager = require('./ProjectFileManager');

class DockerManager {
  constructor() {
    this.docker = new Docker();
    this.containers = new Map();
  }

  async getOrCreateContainer(projectId) {
    let containerInfo = this.containers.get(projectId);
    
    if (!containerInfo) {
      // 프로젝트 파일 초기화
      const projectPath = await ProjectFileManager.initializeProject(projectId);

      // 새 컨테이너 생성
      const container = await this.docker.createContainer({
        Image: 'project-dev-environment',
        name: `project-${projectId}`,
        Tty: true,
        OpenStdin: true,
        Env: [
          `PROJECT_ID=${projectId}`,
          'NODE_ENV=development'
        ],
        WorkingDir: `/app/${projectId}`,
        HostConfig: {
          Binds: [
            // 프로젝트 캐시 마운트
            `${projectPath}:/app/${projectId}`,
            // node_modules 캐시 볼륨
            `node_modules_${projectId}:/app/${projectId}/node_modules`,
            '/var/run/docker.sock:/var/run/docker.sock'
          ],
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
        projectId
      };

      this.containers.set(projectId, containerInfo);
      
      // 기본 개발 환경 설정
      await this.initializeDevEnvironment(container, projectId);
    }

    return containerInfo;
  }

  async initializeDevEnvironment(container, projectId) {
    const setupCommands = [
      'npm config set prefix "/app/.npm-global"',
      'export PATH="/app/.npm-global/bin:$PATH"',
      'npm install -g nodemon ts-node typescript',
      `cd /app/${projectId} && npm install`
    ];

    for (const cmd of setupCommands) {
      await this.executeCommand(container, cmd);
    }
  }

  async executeCommand(container, command) {
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true
    });
    
    return await exec.start();
  }

  async cleanup() {
    for (const [projectId, containerInfo] of this.containers) {
      try {
        // 컨테이너 중지 및 제거
        await containerInfo.container.stop();
        await containerInfo.container.remove();
        this.containers.delete(projectId);
      } catch (error) {
        console.error(`Container cleanup failed for ${projectId}:`, error);
      }
    }
  }
}

module.exports = new DockerManager();