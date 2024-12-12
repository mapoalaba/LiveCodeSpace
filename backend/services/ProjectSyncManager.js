// backend/services/ProjectSyncManager.js
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs-extra');
const chokidar = require('chokidar');
const debounce = require('lodash/debounce');

class ProjectSyncManager {
  constructor() {
    this.s3 = new AWS.S3();
    this.dynamoDB = new AWS.DynamoDB.DocumentClient();
    this.syncQueues = new Map();
    this.watchers = new Map();
    this.SYNC_DELAY = 5000; // 5초
    this.cacheDir = '/var/cache/workspace';
  }

  async initializeProject(projectId) {
    const projectCache = path.join(this.cacheDir, projectId);
    await fs.ensureDir(projectCache);

    // 프로젝트 메타데이터 확인
    const metadata = await this.getProjectMetadata(projectId);
    const localMetadataPath = path.join(projectCache, '.metadata');

    if (!metadata.lastSync || !await fs.pathExists(localMetadataPath)) {
      // 최초 동기화 필요
      await this.fullSync(projectId);
    } else {
      // 증분 동기화
      await this.incrementalSync(projectId, metadata.lastSync);
    }

    // 파일 변경 감지 시작
    this.startWatching(projectId);

    return projectCache;
  }

  async fullSync(projectId) {
    console.log(`Performing full sync for project ${projectId}`);
    const projectCache = path.join(this.cacheDir, projectId);

    try {
      // S3에서 모든 파일 가져오기
      const files = await this.listAllFiles(projectId);
      
      for (const file of files) {
        const localPath = path.join(projectCache, file.Key);
        await fs.ensureDir(path.dirname(localPath));
        
        const s3Object = await this.s3.getObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: file.Key
        }).promise();

        await fs.writeFile(localPath, s3Object.Body);
      }

      // 메타데이터 업데이트
      await this.updateMetadata(projectId, {
        lastSync: new Date().toISOString(),
        lastFullSync: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Full sync failed for project ${projectId}:`, error);
      throw error;
    }
  }

  async incrementalSync(projectId, lastSync) {
    console.log(`Performing incremental sync for project ${projectId}`);
    const projectCache = path.join(this.cacheDir, projectId);

    try {
      // 마지막 동기화 이후 변경된 파일만 가져오기
      const changes = await this.getChangesFromDynamoDB(projectId, lastSync);
      
      for (const change of changes) {
        const localPath = path.join(projectCache, change.path);
        
        if (change.action === 'DELETE') {
          await fs.remove(localPath);
        } else {
          const s3Object = await this.s3.getObject({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: change.path
          }).promise();

          await fs.ensureDir(path.dirname(localPath));
          await fs.writeFile(localPath, s3Object.Body);
        }
      }

    } catch (error) {
      console.error(`Incremental sync failed for project ${projectId}:`, error);
      throw error;
    }
  }

  startWatching(projectId) {
    const projectCache = path.join(this.cacheDir, projectId);
    
    // 이미 감시 중인 경우 중단
    if (this.watchers.has(projectId)) {
      this.watchers.get(projectId).close();
    }

    // 변경 사항 큐 초기화
    this.syncQueues.set(projectId, new Set());

    // 파일 시스템 감시 시작
    const watcher = chokidar.watch(projectCache, {
      ignored: /(^|[\/\\])\../, // 숨김 파일 제외
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    // 변경 감지 시 지연 동기화 실행
    const debouncedSync = debounce(
      () => this.processSyncQueue(projectId),
      this.SYNC_DELAY
    );

    watcher
      .on('add', path => this.queueChange(projectId, path, 'CREATE', debouncedSync))
      .on('change', path => this.queueChange(projectId, path, 'UPDATE', debouncedSync))
      .on('unlink', path => this.queueChange(projectId, path, 'DELETE', debouncedSync));

    this.watchers.set(projectId, watcher);
  }

  queueChange(projectId, filePath, action, debouncedSync) {
    const queue = this.syncQueues.get(projectId);
    const relativePath = path.relative(path.join(this.cacheDir, projectId), filePath);
    
    queue.add({
      path: relativePath,
      action,
      timestamp: Date.now()
    });

    debouncedSync();
  }

  async processSyncQueue(projectId) {
    const queue = this.syncQueues.get(projectId);
    if (!queue || queue.size === 0) return;

    console.log(`Processing sync queue for project ${projectId}: ${queue.size} changes`);

    try {
      const changes = Array.from(queue);
      queue.clear();

      for (const change of changes) {
        if (change.action === 'DELETE') {
          await this.s3.deleteObject({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path.join(projectId, change.path)
          }).promise();
        } else {
          const localPath = path.join(this.cacheDir, projectId, change.path);
          const content = await fs.readFile(localPath);
          
          await this.s3.putObject({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: path.join(projectId, change.path),
            Body: content
          }).promise();
        }

        // 변경 이력 저장
        await this.recordChange(projectId, change);
      }

      // 메타데이터 업데이트
      await this.updateMetadata(projectId, {
        lastSync: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Failed to process sync queue for project ${projectId}:`, error);
      // 실패한 변경사항 다시 큐에 추가
      for (const change of changes) {
        queue.add(change);
      }
    }
  }

  async recordChange(projectId, change) {
    await this.dynamoDB.put({
      TableName: 'ProjectChanges',
      Item: {
        projectId,
        timestamp: change.timestamp,
        path: change.path,
        action: change.action
      }
    }).promise();
  }

  // 메타데이터 관리
  async getProjectMetadata(projectId) {
    const result = await this.dynamoDB.get({
      TableName: 'ProjectMetadata',
      Key: { projectId }
    }).promise();

    return result.Item || { projectId };
  }

  async updateMetadata(projectId, updates) {
    const updateExpr = 'set ' + Object.keys(updates).map(k => `#${k} = :${k}`).join(', ');
    const exprAttrNames = Object.keys(updates).reduce((acc, k) => ({
      ...acc,
      [`#${k}`]: k
    }), {});
    const exprAttrValues = Object.entries(updates).reduce((acc, [k, v]) => ({
      ...acc,
      [`:${k}`]: v
    }), {});

    await this.dynamoDB.update({
      TableName: 'ProjectMetadata',
      Key: { projectId },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: exprAttrNames,
      ExpressionAttributeValues: exprAttrValues
    }).promise();
  }
}

module.exports = new ProjectSyncManager();