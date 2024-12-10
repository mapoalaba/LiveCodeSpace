const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  GetCommand 
} = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand 
} = require("@aws-sdk/client-s3");

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const { v4: uuidv4 } = require('uuid');

// ** 재귀적으로 트리를 생성하는 함수 **
const buildTree = async (projectId, prefix) => {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Prefix: prefix,
    Delimiter: "/"
  };

  try {
    const data = await s3Client.send(new ListObjectsV2Command(params));
    console.log("Raw S3 response for prefix:", prefix, JSON.stringify(data, null, 2));

    // 폴더 처리
    const folders = await Promise.all((data.CommonPrefixes || []).map(async (prefixObj) => {
      const folderPath = prefixObj.Prefix;
      const pathParts = folderPath.split('/').filter(Boolean);
      const folderName = pathParts[pathParts.length - 1];

      // 재귀적으로 하위 폴더 내용 가져오기
      const children = await buildTree(projectId, folderPath);
      
      return {
        id: folderPath,
        name: folderName,
        path: folderPath,
        type: "folder",
        children: children
      };
    }));

    // 파일 처리
    const files = (data.Contents || [])
      .filter(content => {
        return content.Key.startsWith(prefix) && 
               content.Key !== prefix && 
               !content.Key.endsWith('/');
      })
      .map(file => {
        const pathParts = file.Key.split('/').filter(Boolean);
        const fileName = pathParts[pathParts.length - 1];

        return {
          id: file.Key,
          name: fileName,
          path: file.Key,
          type: "file"
        };
      });

    console.log(`Processed items for prefix ${prefix}:`, {
      folders: folders.map(f => f.name),
      files: files.map(f => f.name)
    });

    return [...folders, ...files];
  } catch (error) {
    console.error("Error in buildTree:", error);
    throw error;
  }
};

// ** 프로젝트 파일 트리 조회 **
exports.getProjectTree = async (req, res) => {
  const { projectId } = req.params;
  const { folderPath } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: "Project ID가 필요합니다." });
  }

  try {
    // 폴더 경로 정규화
    const normalizedPath = folderPath 
      ? `${projectId}/${folderPath.replace(/^proj-.*?\//, '')}`
      : `${projectId}/`;

    console.log('Normalized Path:', normalizedPath);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: normalizedPath,
      Delimiter: "/"
    };

    const data = await s3Client.send(new ListObjectsV2Command(params));
    console.log("S3 Response:", JSON.stringify(data, null, 2));

    // 전체 폴더 목록을 한 번에 가져오기
    const listAllParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: `${projectId}/`
    };
    const allData = await s3Client.send(new ListObjectsV2Command(listAllParams));
    console.log("All objects:", JSON.stringify(allData, null, 2));

    // 현재 경로의 직계 자식만 필터링
    const currentLevel = normalizedPath.split('/').filter(Boolean).length;
    
    const folders = (data.CommonPrefixes || [])
      .filter(prefix => {
        const prefixPath = prefix.Prefix;
        const pathParts = prefixPath.split('/').filter(Boolean);
        return pathParts.length === currentLevel + 1;
      })
      .map(prefix => {
        const folderName = prefix.Prefix.split('/').slice(-2, -1)[0];
        return {
          id: prefix.Prefix,
          name: folderName,
          path: prefix.Prefix,
          type: "folder",
          children: []
        };
      });

    const files = (data.Contents || [])
      .filter(content => {
        if (content.Key === normalizedPath || content.Key.endsWith('/')) return false;
        const keyParts = content.Key.split('/').filter(Boolean);
        return keyParts.length === currentLevel + 1;
      })
      .map(file => {
        const fileName = file.Key.split('/').pop();
        return {
          id: file.Key,
          name: fileName,
          path: file.Key,
          type: "file"
        };
      });

    console.log('Returning tree:', JSON.stringify([...folders, ...files], null, 2));
    res.status(200).json({ tree: [...folders, ...files] });

  } catch (error) {
    console.error("Error fetching project tree:", error);
    res.status(500).json({ error: "Failed to fetch project tree." });
  }
};

// ** 프로젝트 생성 **
exports.createProject = async (req, res) => {
  const { projectName } = req.body;
  const { userId } = req.user;

  try {
    // 입력값 검증
    if (!userId || !projectName) {
      return res.status(400).json({
        error: "필수 입력값이 누락되었습니다.",
        required: {
          userId: "사용자 ID가 필요합니다.",
          projectName: "프로젝트 이름이 필요합니다."
        }
      });
    }

    // 프로젝트 객체 생성
    const timestamp = Date.now().toString();
    const newProject = {
      id: uuidv4(), // HASH 키
      projectId: `proj-${timestamp}`, // GSI HASH 키
      userId,
      projectName: projectName.trim(),
      type: 'project', // 항목 타입 구분용
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
    };

    // 생성할 프로젝트 정보 로깅
    console.log("생성 시도할 프로젝트:", JSON.stringify(newProject, null, 2));

    // 키 존재 여부 검증
    if (!newProject.id || !newProject.projectId) {
      throw new Error("필수 키 생성 실패");
    }

    // DynamoDB에 프로젝트 저장
    const putCommand = {
      TableName: "FileSystemItems",
      Item: newProject,
      // 동일 id가 없을 경우에만 생성
      ConditionExpression: "attribute_not_exists(id)"
    };

    console.log("DynamoDB 명령어:", JSON.stringify(putCommand, null, 2));

    await dynamoDB.send(new PutCommand(putCommand));

    // S3에 프로젝트 루트 폴더 생성
    const s3Command = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${newProject.projectId}/`,
      Body: ""
    };

    console.log("S3 명령어:", JSON.stringify(s3Command, null, 2));

    await s3Client.send(new PutObjectCommand(s3Command));

    // 초기 프로젝트 구조 생성 성공
    res.status(201).json({
      message: "프로젝트가 성공적으로 생성되었습니다.",
      project: {
        id: newProject.id,
        projectId: newProject.projectId,
        projectName: newProject.projectName,
        createdAt: newProject.createdAt,
        lastEditedAt: newProject.lastEditedAt
      }
    });

  } catch (error) {
    // 에러 세부 정보 로깅
    console.error("프로젝트 생성 실패:", {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });

    // 클라이언트에 에러 응답
    res.status(500).json({
      error: "프로젝트 생성에 실패했습니다.",
      details: error.message,
      code: error.code || "UNKNOWN_ERROR"
    });
  }
}

// ** 프로젝트 상세 조회 **
exports.getProjectById = async (req, res) => {
  const { projectId } = req.params;

  try {
    const params = {
      TableName: "FileSystemItems",
      Key: { projectId }
    };

    const result = await dynamoDB.send(new GetCommand(params));
    if (!result.Item) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.json(result.Item);
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({ error: "Failed to fetch project." });
  }
};

// ** 사용자 프로젝트 목록 조회 **
exports.getUserProjects = async (req, res) => {
  const { userId } = req.user;

  try {
    const params = {
      TableName: "FileSystemItems",
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    };
    const result = await dynamoDB.send(new ScanCommand(params));
    res.json(result.Items || []);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ error: "Failed to fetch projects." });
  }
};

// ** 파일 내용 조회 **
exports.getFileContent = async (req, res) => {
  const { projectId } = req.params;
  const { filePath } = req.query;

  if (!projectId || !filePath) {
    return res.status(400).json({ error: "Project ID and file path are required." });
  }

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filePath
    };

    const data = await s3Client.send(new GetObjectCommand(params));
    const content = await data.Body.transformToString();

    res.json({ content });
  } catch (error) {
    console.error("Error fetching file content:", error);
    res.status(500).json({ error: "Failed to fetch file content." });
  }
};

// ** 폴더 생성 **
exports.createFolder = async (req, res) => {
  const { projectId, folderPath, folderName } = req.body;

  if (!projectId || !folderName) {
    return res.status(400).json({ error: "Project ID와 폴더 이름이 필요합니다." });
  }

  try {
    let fullFolderPath;
    // 현재 folderPath에 이미 projectId가 포함되어 있는지 확인
    if (folderPath && folderPath.startsWith(`${projectId}/`)) {
      fullFolderPath = `${folderPath}${folderName}/`;
    } else {
      fullFolderPath = folderPath 
        ? `${projectId}/${folderPath}${folderName}/` 
        : `${projectId}/${folderName}/`;
    }

    console.log("Creating folder at path:", fullFolderPath);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fullFolderPath,
      Body: ""
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(201).json({ 
      path: fullFolderPath, 
      name: folderName, 
      type: "folder",
      children: [] 
    });
  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).json({ error: "Failed to create folder" });
  }
};

// ** 파일 생성 **
exports.createFile = async (req, res) => {
  const { projectId, folderPath, fileName } = req.body;

  if (!projectId || !fileName) {
    return res.status(400).json({ error: "Project ID와 파일 이름이 필요합니다." });
  }

  try {
    let fullFilePath;
    // 현재 folderPath에 이미 projectId가 포함되어 있는지 확인
    if (folderPath && folderPath.startsWith(`${projectId}/`)) {
      fullFilePath = `${folderPath}${fileName}`;
    } else {
      fullFilePath = folderPath 
        ? `${projectId}/${folderPath}${fileName}` 
        : `${projectId}/${fileName}`;
    }

    console.log("Creating file at path:", fullFilePath);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fullFilePath,
      Body: "",
      ContentType: "text/plain"
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(201).json({ 
      path: fullFilePath, 
      name: fileName, 
      type: "file" 
    });
  } catch (error) {
    console.error("Error creating file:", error);
    res.status(500).json({ error: "Failed to create file." });
  }
};

// ** 파일 내용 저장 **
exports.updateFileContent = async (req, res) => {
  const { filePath, content } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: "File path is required." });
  }

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filePath,
      Body: content || "",
      ContentType: "text/plain"
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(200).json({ message: "File updated successfully" });
  } catch (error) {
    console.error("Error updating file:", error);
    res.status(500).json({ error: "Failed to update file." });
  }
};

// 폴더 내 모든 항목을 재귀적으로 삭제하는 함수
const deleteFolder = async (prefix) => {
  const listParams = {
    Bucket: process.env.S3_BUCKET_NAME,
    Prefix: prefix
  };

  try {
    // 폴더 내 모든 항목 나열
    const data = await s3Client.send(new ListObjectsV2Command(listParams));
    if (!data.Contents || data.Contents.length === 0) {
      return;
    }

    // 삭제할 객체들의 목록 생성
    const deletePromises = data.Contents.map(item => {
      return s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: item.Key
      }));
    });

    // 모든 객체 삭제
    await Promise.all(deletePromises);

    // 다음 페이지가 있으면 재귀적으로 처리
    if (data.IsTruncated) {
      await deleteFolder(prefix);
    }
  } catch (error) {
    console.error('Error deleting folder contents:', error);
    throw error;
  }
};

// 파일 삭제 핸들러
exports.deleteFile = async (req, res) => {
  const { projectId } = req.params;
  const { filePath } = req.body;

  if (!projectId || !filePath) {
    return res.status(400).json({ error: "Project ID와 파일 경로가 필요합니다." });
  }

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filePath
    };

    await s3Client.send(new DeleteObjectCommand(params));
    res.status(200).json({ message: "파일이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ error: "파일 삭제에 실패했습니다." });
  }
};

// 폴더 삭제 핸들러
exports.deleteFolder = async (req, res) => {
  const { projectId } = req.params;
  const { folderPath } = req.body;

  if (!projectId || !folderPath) {
    return res.status(400).json({ error: "Project ID와 폴더 경로가 필요합니다." });
  }

  try {
    await deleteFolder(folderPath);
    res.status(200).json({ message: "폴더가 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("Error deleting folder:", error);
    res.status(500).json({ error: "폴더 삭제에 실패했습니다." });
  }
};

// 폴더 및 파일 이름 변경
exports.renameItem = async (req, res) => {
  const { projectId } = req.params;
  const { oldPath, newName, type } = req.body;

  if (!projectId || !oldPath || !newName) {
    return res.status(400).json({ error: "필수 정보가 누락되었습니다." });
  }

  try {
    // 새로운 경로 생성
    const pathParts = oldPath.split('/');
    pathParts.pop(); // 마지막 이름 제거
    const newPath = type === 'folder' 
      ? [...pathParts, newName, ''].join('/') // 폴더는 끝에 / 추가
      : [...pathParts, newName].join('/');

    // 1. 기존 항목이 존재하는지 확인
    const checkParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: newPath
    };

    try {
      await s3Client.send(new HeadObjectCommand(checkParams));
      return res.status(400).json({ error: "이미 같은 이름의 항목이 존재합니다." });
    } catch (error) {
      // 항목이 없으면 정상적으로 진행
      if (error.name !== 'NotFound') throw error;
    }

    if (type === 'folder') {
      // 폴더인 경우 모든 하위 항목도 이동
      const listParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Prefix: oldPath
      };

      const data = await s3Client.send(new ListObjectsV2Command(listParams));
      
      // 모든 하위 항목에 대해 복사 및 삭제 작업 수행
      for (const item of data.Contents || []) {
        const newKey = item.Key.replace(oldPath, newPath);
        
        await s3Client.send(new CopyObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          CopySource: `${process.env.S3_BUCKET_NAME}/${item.Key}`,
          Key: newKey
        }));

        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: item.Key
        }));
      }
    } else {
      // 파일인 경우 단순 복사 후 삭제
      await s3Client.send(new CopyObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        CopySource: `${process.env.S3_BUCKET_NAME}/${oldPath}`,
        Key: newPath
      }));

      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: oldPath
      }));
    }

    res.status(200).json({ 
      oldPath,
      newPath,
      type,
      message: "이름이 성공적으로 변경되었습니다."
    });
  } catch (error) {
    console.error("Error renaming item:", error);
    res.status(500).json({ error: "이름 변경에 실패했습니다." });
  }
};