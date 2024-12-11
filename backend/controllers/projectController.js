const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  GetCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand  // UpdateCommand 추가
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

    // ProjectMembers 테이블에 소유자를 멤버로 추가
    const memberParams = {
      TableName: "ProjectMembers",
      Item: {
        id: uuidv4(),
        projectId: newProject.projectId,
        userId,
        role: "owner",
        addedAt: new Date().toISOString()
      }
    };

    await dynamoDB.send(new PutCommand(memberParams));

    // 초기 프로젝트 구조 생성 성공
    res.status(201).json({
      message: "프로젝트가 성공적으로 생성되었습니다.",
      project: {
        id: newProject.id,
        projectId: newProject.projectId,
        projectName: newProject.projectName,
        createdAt: newProject.createdAt,
        lastEditedAt: newProject.lastEditedAt,
        userId: userId,  // userId 추가
        role: 'owner'   // role 정보 추가
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
    // 1. 사용자가 소유한 프로젝트 조회
    const ownedProjectsParams = {
      TableName: "FileSystemItems",
      FilterExpression: "userId = :userId AND #type = :type",
      ExpressionAttributeNames: {
        "#type": "type"
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":type": "project"
      }
    };

    // 2. ProjectMembers 테이블에서 사용자가 멤버로 있는 프로젝트 ID 조회
    const memberProjectsParams = {
      TableName: "ProjectMembers",
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId
      }
    };

    const [ownedProjectsResult, memberProjectsResult] = await Promise.all([
      dynamoDB.send(new ScanCommand(ownedProjectsParams)),
      dynamoDB.send(new ScanCommand(memberProjectsParams))
    ]);

    // 3. 멤버로 참여하는 프로젝트들의 상세 정보 조회
    const memberProjectIds = memberProjectsResult.Items?.map(item => item.projectId) || [];
    const memberProjectsDetailsPromises = memberProjectIds.map(async (projectId) => {
      const projectParams = {
        TableName: "FileSystemItems",
        FilterExpression: "projectId = :projectId AND #type = :type",
        ExpressionAttributeNames: {
          "#type": "type"
        },
        ExpressionAttributeValues: {
          ":projectId": projectId,
          ":type": "project"
        }
      };
      
      const projectResult = await dynamoDB.send(new ScanCommand(projectParams));
      return projectResult.Items?.[0];
    });

    const memberProjects = (await Promise.all(memberProjectsDetailsPromises)).filter(Boolean);

    // 4. 소유 프로젝트와 멤버 프로젝트 합치기 (중복 제거)
    const allProjects = [
      ...(ownedProjectsResult.Items || []),
      ...memberProjects
    ];

    // 중복 제거 (projectId 기준)
    const uniqueProjects = Array.from(
      new Map(allProjects.map(project => [project.projectId, project])).values()
    );

    // 각 프로젝트에 권한 정보 추가
    const projectsWithRole = uniqueProjects.map(project => ({
      ...project,
      role: project.userId === userId ? 'owner' : 'member'
    }));

    res.json(projectsWithRole);

  } catch (error) {
    console.error("프로젝트 목록 조회 실패:", error);
    res.status(500).json({
      error: "프로젝트 목록을 가져오는데 실패했습니다.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// ** 프로젝트 삭제 **
exports.deleteProject = async (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.user;

  try {
    // DynamoDB에서 프로젝트 정보 조회
    const params = {
      TableName: "FileSystemItems",
      FilterExpression: "projectId = :projectId AND userId = :userId",
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":userId": userId
      }
    };

    const result = await dynamoDB.send(new ScanCommand(params));
    const project = result.Items?.[0];
    
    if (!project) {
      return res.status(403).json({ error: "프로젝트를 찾을 수 없거나 삭제 권한이 없습니다." });
    }

    // FileSystemItems 테이블에서 프로젝트와 관련된 모든 항목 조회
    const fileSystemParams = {
      TableName: "FileSystemItems",
      IndexName: "ByProject",
      KeyConditionExpression: "projectId = :projectId",
      ExpressionAttributeValues: {
        ":projectId": projectId
      }
    };

    const fileSystemItems = await dynamoDB.send(new QueryCommand(fileSystemParams));

    // S3에서 프로젝트 관련 모든 파일 삭제
    await deleteFolder(`${projectId}/`);

    // FileSystemItems 테이블에서 모든 관련 항목 삭제
    const deletePromises = (fileSystemItems.Items || []).map(item => 
      dynamoDB.send(new DeleteCommand({
        TableName: "FileSystemItems",
        Key: { id: item.id }
      }))
    );

    // 병렬로 모든 삭제 작업 실행
    await Promise.all(deletePromises);

    // DynamoDB에서 프로젝트 자체 삭제
    await dynamoDB.send(new DeleteCommand({
      TableName: "FileSystemItems",
      Key: { id: project.id }
    }));

    res.status(200).json({ message: "프로젝트와 관련 파일들이 성공적으로 삭제되었습니다." });

  } catch (error) {
    console.error("프로젝트 삭제 실패:", error);
    res.status(500).json({ error: "프로젝트 삭제에 실패했습니다." });
  }
};

// 프로젝트 초대 함수 수정
exports.inviteToProject = async (req, res) => {
  const { projectId } = req.params;
  const { email } = req.body;
  const { userId } = req.user;

  console.log("\n=== 프로젝트 초대 프로세스 시작 ===");
  console.log("1. 초대 요청 데이터:", { projectId, email, inviterId: userId });

  try {
    // 1. 프로젝트 소유자 확인
    const projectParams = {
      TableName: "FileSystemItems",
      FilterExpression: "projectId = :projectId",
      ExpressionAttributeValues: {
        ":projectId": projectId
      }
    };
    
    const projectResult = await dynamoDB.send(new ScanCommand(projectParams));
    const project = projectResult.Items?.[0];
    console.log("2. 프로젝트 조회 결과:", project);
    
    if (!project) {
      return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
    }

    // 2. 초대할 사용자 확인
    const userParams = {
      TableName: "Users",
      FilterExpression: "email = :email",
      ExpressionAttributeValues: {
        ":email": email
      }
    };
    
    const userResult = await dynamoDB.send(new ScanCommand(userParams));
    const invitedUser = userResult.Items?.[0];
    console.log("3. 초대할 사용자 정보:", invitedUser);
    
    if (!invitedUser) {
      return res.status(404).json({ error: "존재하지 않는 사용자입니다." });
    }

    // 3. 이미 프로젝트 멤버인지 확인 (새로운 코드)
    const memberCheckParams = {
      TableName: "ProjectMembers",
      FilterExpression: "projectId = :projectId AND userId = :inviteeId",
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":inviteeId": invitedUser.userId
      }
    };

    const existingMember = await dynamoDB.send(new ScanCommand(memberCheckParams));
    if (existingMember.Items?.length > 0) {
      return res.status(400).json({ error: "이미 프로젝트 멤버인 사용자입니다." });
    }

    // 4. 중복 초대 확인
    const existingInviteParams = {
      TableName: "ProjectInvites",  // Changed from ProjectInvitations
      FilterExpression: "projectId = :projectId AND inviteeId = :inviteeId AND #status = :status",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":inviteeId": invitedUser.userId,
        ":status": "pending"
      }
    };

    const existingInvite = await dynamoDB.send(new ScanCommand(existingInviteParams));
    if (existingInvite.Items?.length > 0) {
      return res.status(400).json({ error: "이미 초대된 사용자입니다." });
    }

    // 4. 초대 생성
    const invitation = {
      id: uuidv4(),
      projectId,
      inviterId: userId,
      inviteeId: invitedUser.userId,
      projectName: project.projectName,  // 프로젝트 이름도 저장
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    console.log("4. ProjectInvites 테이블에 저장할 초대 정보:", JSON.stringify(invitation, null, 2));

    await dynamoDB.send(new PutCommand({
      TableName: "ProjectInvites",
      Item: invitation
    }));

    // 저장된 초대 확인
    const savedInvite = await dynamoDB.send(new GetCommand({
      TableName: "ProjectInvites",
      Key: { id: invitation.id }
    }));

    console.log("5. ProjectInvites 테이블에 저장된 초대:", JSON.stringify(savedInvite.Item, null, 2));

    res.status(200).json({ message: "초대가 성공적으로 전송되었습니다." });

  } catch (error) {
    console.error("초대 생성 오류:", error);
    res.status(500).json({ error: "초대 처리 중 오류가 발생했습니다." });
  }
};

// 초대 수락 함수 수정
exports.acceptInvitation = async (req, res) => {
  const { projectId } = req.params;
  const { userId } = req.user;

  console.log("1. 초대 수락 시작:", { projectId, userId });

  try {
    // 초대 확인
    const invitationParams = {
      TableName: "ProjectInvites",
      FilterExpression: "projectId = :projectId AND inviteeId = :userId AND #status = :status",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":userId": userId,
        ":status": "pending"
      }
    };
    
    const invitationResult = await dynamoDB.send(new ScanCommand(invitationParams));
    const invitation = invitationResult.Items?.[0];
    
    console.log("2. 찾은 초대:", invitation);

    if (!invitation) {
      return res.status(404).json({ error: "유효한 초대를 찾을 수 없습니다." });
    }

    // 프로젝트 정보 조회
    const projectParams = {
      TableName: "FileSystemItems",
      FilterExpression: "projectId = :projectId",
      ExpressionAttributeValues: {
        ":projectId": projectId
      }
    };

    const projectResult = await dynamoDB.send(new ScanCommand(projectParams));
    const project = projectResult.Items?.find(item => item.type === 'project');

    if (!project) {
      return res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
    }

    // 프로젝트 멤버로 추가
    const memberParams = {
      TableName: "ProjectMembers",
      Item: {
        id: uuidv4(),
        projectId,
        userId,
        role: "member",
        addedAt: new Date().toISOString()
      }
    };

    console.log("3. 추가할 멤버 정보:", memberParams.Item);
    await dynamoDB.send(new PutCommand(memberParams));

    // 초대 상태 업데이트
    const updateParams = {
      TableName: "ProjectInvites",
      Key: {
        id: invitation.id
      },
      UpdateExpression: "set #status = :status, acceptedAt = :acceptedAt",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":status": "accepted",
        ":acceptedAt": new Date().toISOString()
      },
      ReturnValues: "ALL_NEW"
    };

    console.log("4. 초대 상태 업데이트 파라미터:", updateParams);
    const updateResult = await dynamoDB.send(new UpdateCommand(updateParams));

    // 응답에 프로젝트 정보 포함
    res.status(200).json({ 
      message: "초대가 수락되었습니다.",
      project: {
        projectId: project.projectId,
        projectName: project.projectName,
        createdAt: project.createdAt,
        lastEditedAt: project.lastEditedAt
      }
    });

  } catch (error) {
    console.error("초대 수락 오류:", error);
    res.status(500).json({ 
      error: "초대 수락 중 오류가 발생했습니다.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 받은 초대 목록 조회 함수 수정
exports.getInvitations = async (req, res) => {
  const { userId } = req.user;
  
  console.log("\n=== 초대 목록 조회 프로세스 시작 ===");
  console.log("1. 요청한 사용자 ID:", userId);

  try {
    // ProjectInvites 테이블의 모든 내용 조회 (디버깅용)
    const allInvitesResult = await dynamoDB.send(new ScanCommand({
      TableName: "ProjectInvites"
    }));
    console.log("2. ProjectInvites 테이블의 전체 데이터:", JSON.stringify(allInvitesResult.Items, null, 2));

    // 특정 사용자의 대기 중인 초대 조회
    const invitationParams = {
      TableName: "ProjectInvites",
      FilterExpression: "inviteeId = :userId AND #status = :status",
      ExpressionAttributeNames: {
        "#status": "status"
      },
      ExpressionAttributeValues: {
        ":userId": userId,
        ":status": "pending"
      }
    };

    console.log("3. 초대 조회 파라미터:", JSON.stringify(invitationParams, null, 2));
    
    const invitationResult = await dynamoDB.send(new ScanCommand(invitationParams));
    console.log("4. 현재 사용자의 대기 중인 초대:", JSON.stringify(invitationResult.Items, null, 2));

    if (!invitationResult.Items || invitationResult.Items.length === 0) {
      return res.status(200).json([]);
    }

    const projectPromises = invitationResult.Items.map(async (invitation) => {
      console.log("8. 개별 초대 처리:", invitation);

      const projectParams = {
        TableName: "FileSystemItems",
        FilterExpression: "projectId = :projectId",
        ExpressionAttributeValues: {
          ":projectId": invitation.projectId
        }
      };

      const projectResult = await dynamoDB.send(new ScanCommand(projectParams));
      const project = projectResult.Items?.[0];

      if (!project) {
        console.log(`9. 프로젝트 없음: ${invitation.projectId}`);
        return null;
      }

      return {
        ...invitation,
        projectName: project.projectName
      };
    });

    const results = await Promise.all(projectPromises);
    const validInvitations = results.filter(Boolean);
    console.log("5. 클라이언트에 반환할 최종 데이터:", JSON.stringify(validInvitations, null, 2));

    return res.status(200).json(validInvitations);

  } catch (error) {
    console.error("초대 목록 조회 실패:", error);
    res.status(500).json({
      error: "초대 목록을 가져오는데 실패했습니다.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 프로젝트 멤버 조회
exports.getProjectMembers = async (req, res) => {
  const { projectId } = req.params;

  try {
    const memberParams = {
      TableName: "ProjectMembers",
      FilterExpression: "projectId = :projectId",
      ExpressionAttributeValues: {
        ":projectId": projectId
      }
    };

    const memberResult = await dynamoDB.send(new ScanCommand(memberParams));
    
    const memberPromises = memberResult.Items.map(async (member) => {
      const userParams = {
        TableName: "Users",
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: {
          ":userId": member.userId
        }
      };
      
      const userResult = await dynamoDB.send(new ScanCommand(userParams));
      const user = userResult.Items[0];
      
      return {
        userId: member.userId,  // userId 추가
        email: user.email,
        role: member.role
      };
    });

    const members = await Promise.all(memberPromises);

    // 소유자가 먼저 오도록 정렬
    const sortedMembers = members.sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      return a.email.localeCompare(b.email); // 멤버들은 이메일 순으로 정렬
    });

    res.status(200).json(sortedMembers);

  } catch (error) {
    console.error("프로젝트 멤버 조회 실패:", error);
    res.status(500).json({ error: "멤버 목록을 가져오는데 실패했습니다." });
  }
};

// 프로젝트 멤버 삭제
exports.removeMember = async (req, res) => {
  const { projectId, userId: memberToRemove } = req.params;
  const { userId } = req.user;

  try {
    // 요청한 사용자가 owner인지 확인
    const ownerCheckParams = {
      TableName: "ProjectMembers",
      FilterExpression: "projectId = :projectId AND userId = :userId AND #role = :role",
      ExpressionAttributeNames: {
        "#role": "role"
      },
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":userId": userId,
        ":role": "owner"
      }
    };

    const ownerResult = await dynamoDB.send(new ScanCommand(ownerCheckParams));
    if (!ownerResult.Items?.length) {
      return res.status(403).json({ error: "프로젝트 소유자만 멤버를 삭제할 수 있습니다." });
    }

    // 삭제할 멤버 찾기
    const memberParams = {
      TableName: "ProjectMembers",
      FilterExpression: "projectId = :projectId AND userId = :userId AND #role = :role",
      ExpressionAttributeNames: {
        "#role": "role"
      },
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":userId": memberToRemove,
        ":role": "member"
      }
    };

    const memberResult = await dynamoDB.send(new ScanCommand(memberParams));
    const memberToDelete = memberResult.Items?.[0];

    if (!memberToDelete) {
      return res.status(404).json({ error: "삭제할 멤버를 찾을 수 없습니다." });
    }

    // 멤버 삭제
    await dynamoDB.send(new DeleteCommand({
      TableName: "ProjectMembers",
      Key: { id: memberToDelete.id }
    }));

    res.status(200).json({ message: "멤버가 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("멤버 삭제 실패:", error);
    res.status(500).json({ error: "멤버 삭제에 실패했습니다." });
  }
};