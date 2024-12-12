// backend/services/ProjectFileManager.js

const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');
const chokidar = require('chokidar');
const debounce = require('lodash/debounce');

class ProjectFileManager {
  constructor() {
    this.s3 = new AWS.S3();
    this.dynamoDB = new AWS.DynamoDB.DocumentClient();
    this.watchers = new Map();
    this.changeQueues = new Map();
    
    // 캐시 설정
    this.cacheDir = '/var/cache/projects';
    this.SYNC_DELAY = 5000; // 5초 지연
    
    // 캐시 디렉토리 생성
    fs.ensureDirSync(this.cacheDir);
  }

  async initializeProject(projectId) {
    console.log(`Initializing project: ${projectId}`);
    
    const projectCacheDir = this.getProjectCachePath(projectId);
    
    try {
      // 캐시 상태 확인
      const cacheMetadata = await this.getCacheMetadata(projectId);
      const needsFullSync = !cacheMetadata || this.isCacheStale(cacheMetadata);

      if (needsFullSync) {
        await this.performFullSync(projectId);
      } else {
        await this.performIncrementalSync(projectId, cacheMetadata.lastSync);
      }

      // 파일 변경 감지 시작
      this.startFileWatcher(projectId);

      return projectCacheDir;
    } catch (error) {
      console.error(`Project initialization failed: ${error}`);
      throw error;
    }
  }

  getProjectCachePath(projectId) {
    return path.join(this.cacheDir, projectId);
  }

  async getCacheMetadata(projectId) {
    try {
      const result = await this.dynamoDB.get({
        TableName: 'ProjectCache',
        Key: { projectId }
      }).promise();
      return result.Item;
    } catch (error) {
      console.error(`Failed to get cache metadata: ${error}`);
      return null;
    }
  }

  isCacheStale(metadata) {
    const cacheAge = Date.now() - new Date(metadata.lastSync).getTime();
    return cacheAge > 24 * 60 * 60 * 1000; // 24시간 이상 경과
  }

  async performFullSync(projectId) {
    console.log(`Performing full sync for project: ${projectId}`);
    const projectCacheDir = this.getProjectCachePath(projectId);

    try {
      // 기존 캐시 클리어
      await fs.emptyDir(projectCacheDir);

      // S3에서 전체 파일 목록 가져오기
      const files = await this.listAllS3Files(projectId);

      // 파일 다운로드 및 캐시
      for (const file of files) {
        await this.downloadAndCacheFile(projectId, file.Key);
      }

      // 캐시 메타데이터 업데이트
      await this.updateCacheMetadata(projectId);

    } catch (error) {
      console.error(`Full sync failed: ${error}`);
      throw error;
    }
  }

  async performIncrementalSync(projectId, lastSync) {
    console.log(`Performing incremental sync for project: ${projectId}`);

    try {
      const changes = await this.getChangesFromDynamoDB(projectId, lastSync);
      
      for (const change of changes) {
        await this.applyCacheChange(projectId, change);
      }

      await this.updateCacheMetadata(projectId);
    } catch (error) {
      console.error(`Incremental sync failed: ${error}`);
      throw error;
    }
  }

  async downloadAndCacheFile(projectId, fileKey) {
    const cachePath = path.join(this.getProjectCachePath(projectId), fileKey);
    
    try {
      const s3Object = await this.s3.getObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey
      }).promise();

      await fs.ensureDir(path.dirname(cachePath));
      await fs.writeFile(cachePath, s3Object.Body);
    } catch (error) {
      console.error(`File download failed: ${error}`);
      throw error;
    }
  }

  startFileWatcher(projectId) {
    const projectCacheDir = this.getProjectCachePath(projectId);
    
    // 기존 watcher가 있다면 제거
    if (this.watchers.has(projectId)) {
      this.watchers.get(projectId).close();
    }

    // 변경 큐 초기화
    this.changeQueues.set(projectId, new Set());

    // 새로운 watcher 생성
    const watcher = chokidar.watch(projectCacheDir, {
      ignored: /(^|[\/\\])\../, // 숨김 파일 무시
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // 지연된 동기화 함수
    const debouncedSync = debounce(
      () => this.processChangeQueue(projectId),
      this.SYNC_DELAY
    );

    // 이벤트 핸들러 설정
    watcher
      .on('add', path => this.queueFileChange(projectId, path, 'CREATE', debouncedSync))
      .on('change', path => this.queueFileChange(projectId, path, 'UPDATE', debouncedSync))
      .on('unlink', path => this.queueFileChange(projectId, path, 'DELETE', debouncedSync));

    this.watchers.set(projectId, watcher);
  }

  queueFileChange(projectId, filePath, changeType, debouncedSync) {
    const queue = this.changeQueues.get(projectId);
    const relativePath = path.relative(this.getProjectCachePath(projectId), filePath);
    
    queue.add({
      path: relativePath,
      type: changeType,
      timestamp: Date.now()
    });

    debouncedSync();
  }

  async processChangeQueue(projectId) {
    const queue = this.changeQueues.get(projectId);
    if (!queue || queue.size === 0) return;

    console.log(`Processing ${queue.size} changes for project ${projectId}`);

    const changes = Array.from(queue);
    queue.clear();

    try {
      for (const change of changes) {
        await this.syncFileChange(projectId, change);
      }

      // 메타데이터 업데이트
      await this.updateCacheMetadata(projectId);
      
      // 변경사항 기록
      await this.recordChanges(projectId, changes);
    } catch (error) {
      console.error(`Failed to process change queue: ${error}`);
      // 실패한 변경사항 다시 큐에 추가
      changes.forEach(change => queue.add(change));
    }
  }

  async syncFileChange(projectId, change) {
    const filePath = path.join(this.getProjectCachePath(projectId), change.path);

    try {
      if (change.type === 'DELETE') {
        await this.s3.deleteObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: path.join(projectId, change.path)
        }).promise();
      } else {
        const content = await fs.readFile(filePath);
        await this.s3.putObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: path.join(projectId, change.path),
          Body: content
        }).promise();
      }
    } catch (error) {
      console.error(`Failed to sync file change: ${error}`);
      throw error;
    }
  }

  async recordChanges(projectId, changes) {
    const changeRecords = changes.map(change => ({
      projectId,
      timestamp: change.timestamp,
      path: change.path,
      type: change.type
    }));

    try {
      // 변경사항을 일괄로 DynamoDB에 기록
      await Promise.all(changeRecords.map(record =>
        this.dynamoDB.put({
          TableName: 'ProjectChanges',
          Item: record
        }).promise()
      ));
    } catch (error) {
      console.error(`Failed to record changes: ${error}`);
      throw error;
    }
  }

  async updateCacheMetadata(projectId) {
    try {
      await this.dynamoDB.put({
        TableName: 'ProjectCache',
        Item: {
          projectId,
          lastSync: new Date().toISOString()
        }
      }).promise();
    } catch (error) {
      console.error(`Failed to update cache metadata: ${error}`);
      throw error;
    }
  }
}

module.exports = new ProjectFileManager();