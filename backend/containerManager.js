// containerManager.js
const Docker = require('dockerode');
const docker = new Docker();

class ResourceManager {
  constructor() {
    this.limits = {
      memory: 2 * 1024 * 1024 * 1024, // 2GB
      cpu: 2 * 1000000000, // 2 cores
      maxContainers: 10
    };
    this.usage = new Map();
  }

  async monitorContainer(container) {
    const stats = await container.stats({ stream: false });
    return {
      memoryUsage: stats.memory_stats.usage,
      cpuUsage: stats.cpu_stats.cpu_usage.total_usage
    };
  }

  async checkResources(containerId) {
    const usage = await this.monitorContainer(docker.getContainer(containerId));
    if (usage.memoryUsage > this.limits.memory * 0.9) {
      throw new Error('Memory limit exceeded');
    }
    return true;
  }
}

class ContainerManager {
  constructor() {
    this.containers = new Map();
    this.terminals = new Map();
    this.resourceManager = new ResourceManager();
  }

  async getOrCreateContainer(projectId, userId) {
    let containerInfo = this.containers.get(projectId);
    
    if (!containerInfo) {
      if (this.containers.size >= this.resourceManager.limits.maxContainers) {
        await this.cleanup(true); // 강제 정리
      }

      // 새 컨테이너 생성
      const container = await docker.createContainer({
        Image: 'project-dev-environment',
        name: `project-${projectId}`,
        Env: [
          `PROJECT_ID=${projectId}`,
          `USER_ID=${userId}`,
          'NODE_ENV=development',
          'PATH=/app/.npm-global/bin:$PATH'
        ],
        Tty: true,
        OpenStdin: true,
        Cmd: ["/bin/bash"],
        WorkingDir: `/app/${projectId}`,
        HostConfig: {
          Binds: [
            // 프로젝트 캐시 디렉토리 마운트
            `${process.env.CACHE_DIR}/${projectId}:/app/${projectId}`,
            // node_modules 캐시 볼륨 마운트
            `node_modules_${projectId}:/app/${projectId}/node_modules`,
            '/var/run/docker.sock:/var/run/docker.sock'
          ],
          Memory: this.resourceManager.limits.memory,
          NanoCPUs: this.resourceManager.limits.cpu,
          SecurityOpt: ['seccomp=unconfined'],
          NetworkMode: 'bridge',
          PortBindings: {
            '3000/tcp': [{ HostPort: '' }],
            '3001/tcp': [{ HostPort: '' }]
          },
          RestartPolicy: {
            Name: 'on-failure',
            MaximumRetryCount: 3
          }
        }
      });

      try {
        await container.start();
        
        // 리소스 체크
        await this.resourceManager.checkResources(container.id);
        
        containerInfo = {
          container,
          sessions: new Map(),
          lastActivity: Date.now(),
          projectId,
          userId,
          status: 'running',
          ports: await this.getContainerPorts(container)
        };
        
        this.containers.set(projectId, containerInfo);
        
        // 기본 개발 환경 설정
        await this.initializeDevEnvironment(container, projectId);
        
        // 컨테이너 상태 모니터링 시작
        this.startMonitoring(containerInfo);
      } catch (error) {
        await this.handleContainerError(container, error);
        throw error;
      }
    }

    return containerInfo;
  }

  async getContainerPorts(container) {
    const data = await container.inspect();
    const ports = {};
    if (data.NetworkSettings && data.NetworkSettings.Ports) {
      for (const [key, value] of Object.entries(data.NetworkSettings.Ports)) {
        if (value && value[0]) {
          ports[key] = value[0].HostPort;
        }
      }
    }
    return ports;
  }

  async initializeDevEnvironment(container, projectId) {
    const setupCommands = [
      'npm config set prefix "/app/.npm-global"',
      'npm install -g nodemon ts-node typescript create-react-app',
      `cd /app/${projectId}`,
      'if [ -f package.json ]; then npm install; fi'
    ];

    for (const cmd of setupCommands) {
      try {
        await this.executeCommand(container, cmd);
      } catch (error) {
        console.error(`Setup command failed: ${cmd}`, error);
        throw new Error(`Environment setup failed: ${error.message}`);
      }
    }
  }

  async executeCommand(container, command) {
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
      Env: ['FORCE_COLOR=1'] // 컬러 출력 강제
    });
    
    return new Promise((resolve, reject) => {
      exec.start(async (err, stream) => {
        if (err) reject(err);
        
        let output = '';
        stream.on('data', data => {
          output += data.toString();
        });
        
        stream.on('end', () => {
          resolve(output);
        });
        
        stream.on('error', reject);
      });
    });
  }

  async createTerminalSession(projectId, socketId) {
    const containerInfo = await this.getOrCreateContainer(projectId);
    if (!containerInfo) throw new Error('Container not found');

    const exec = await containerInfo.container.exec({
      Cmd: ['/bin/bash'],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: true,
      Tty: true,
      Env: [
        'TERM=xterm-256color',
        'COLORTERM=truecolor',
        'FORCE_COLOR=1'
      ]
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true
    });

    containerInfo.sessions.set(socketId, {
      stream,
      exec,
      lastActivity: Date.now(),
      status: 'active'
    });

    // 세션 활성화 시간 업데이트
    containerInfo.lastActivity = Date.now();

    return stream;
  }

  async startMonitoring(containerInfo) {
    const interval = setInterval(async () => {
      try {
        const stats = await this.resourceManager.monitorContainer(containerInfo.container);
        
        // 리소스 사용량이 임계치를 넘으면 경고
        if (stats.memoryUsage > this.resourceManager.limits.memory * 0.8) {
          console.warn(`High memory usage in container ${containerInfo.container.id}`);
        }

        // 컨테이너 상태 체크
        const data = await containerInfo.container.inspect();
        if (!data.State.Running) {
          console.error(`Container ${containerInfo.container.id} is not running`);
          await this.handleContainerError(containerInfo.container, new Error('Container stopped'));
        }
      } catch (error) {
        console.error(`Monitoring error for container ${containerInfo.container.id}:`, error);
      }
    }, 30000); // 30초마다 체크

    containerInfo.monitoringInterval = interval;
  }

  async handleContainerError(container, error) {
    console.error(`Container error: ${error.message}`);
    
    try {
      // 컨테이너 재시작 시도
      await container.restart();
      console.log(`Container ${container.id} restarted successfully`);
    } catch (restartError) {
      console.error(`Failed to restart container: ${restartError.message}`);
      // 컨테이너 제거 시도
      try {
        await container.remove({ force: true });
      } catch (removeError) {
        console.error(`Failed to remove container: ${removeError.message}`);
      }
    }
  }

  async cleanup(force = false) {
    const now = Date.now();
    for (const [projectId, containerInfo] of this.containers) {
      if (force || now - containerInfo.lastActivity > 30 * 60 * 1000) {
        try {
          clearInterval(containerInfo.monitoringInterval);
          await containerInfo.container.stop();
          await containerInfo.container.remove();
          this.containers.delete(projectId);
        } catch (error) {
          console.error(`Cleanup failed for container ${containerInfo.container.id}:`, error);
        }
      }
    }
  }

  async terminateSession(socketId, projectId) {
    const containerInfo = this.containers.get(projectId);
    if (!containerInfo) return;

    const session = containerInfo.sessions.get(socketId);
    if (session) {
      try {
        session.stream.end();
        containerInfo.sessions.delete(socketId);
      } catch (error) {
        console.error(`Session termination failed: ${error.message}`);
      }
    }

    // 세션이 없으면 컨테이너 정리 검토
    if (containerInfo.sessions.size === 0) {
      await this.cleanup();
    }
  }
}

module.exports = new ContainerManager();