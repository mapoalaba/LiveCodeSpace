const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  ScanCommand, 
  DeleteCommand, 
  GetCommand 
} = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  ListObjectsV2Command 
} = require("@aws-sdk/client-s3");

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// 프로젝트 트리 조회
exports.getProjectTree = async (req, res) => {
  const { projectId } = req.params;
  const { folderPath } = req.query; // 폴더 경로를 전달받음

  if (!projectId) {
    return res.status(400).json({ error: "Project ID가 필요합니다." });
  }

  try {
    const prefix = folderPath ? `${projectId}/${folderPath}/` : `${projectId}/`;
    console.log("Fetching tree for folderPath:", folderPath);
    console.log("Prefix used:", prefix);

    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
    };

    const data = await s3Client.send(new ListObjectsV2Command(params));
    console.log("S3 Response Data:", data); // S3에서 반환된 전체 데이터 확인

    const folders = (data.CommonPrefixes || []).map((prefix) => ({
      id: prefix.Prefix,
      name: prefix.Prefix.split("/").slice(-2, -1)[0], // 폴더명 추출
      path: prefix.Prefix,
      type: "folder",
    }));

    const files = (data.Contents || [])
      .filter((content) => content.Key !== prefix) // 현재 폴더 경로 제외
      .map((file) => ({
        id: file.Key,
        name: file.Key.split("/").pop(), // 파일명 추출
        path: file.Key,
        type: "file",
      }));

    console.log("Parsed Folders:", folders);
    console.log("Parsed Files:", files);

    res.status(200).json({ tree: [...folders, ...files] });
  } catch (error) {
    console.error("Error fetching project tree:", error.message);
    res.status(500).json({ error: "Failed to fetch project tree." });
  }
};

// ** 프로젝트 생성 **
exports.createProject = async (req, res) => {
  const { projectName } = req.body;
  const { userId } = req.user;

  if (!userId || !projectName) {
    return res.status(400).json({ error: "User ID and Project Name are required." });
  }

  const newProject = {
    userId,
    projectId: `proj-${Date.now()}`,
    projectName: projectName.trim(),
    createdAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  };

  try {
    await dynamoDB.send(new PutCommand({ TableName: "LiveCodeProjects", Item: newProject }));
    res.status(201).json({ project: newProject });
  } catch (error) {
    console.error("Error creating project:", error.message);
    res.status(500).json({ error: "Failed to create project." });
  }
};

// ** 프로젝트 상세 조회 **
exports.getProjectById = async (req, res) => {
  const { projectId } = req.params;

  try {
    const params = {
      TableName: "LiveCodeProjects",
      Key: { projectId },
    };

    const result = await dynamoDB.send(new GetCommand(params));
    if (!result.Item) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.json(result.Item);
  } catch (error) {
    console.error("Error fetching project:", error.message);
    res.status(500).json({ error: "Failed to fetch project." });
  }
};

// ** 사용자 프로젝트 목록 조회 **
exports.getUserProjects = async (req, res) => {
  const { userId } = req.user;

  try {
    const params = {
      TableName: "LiveCodeProjects",
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    };
    const result = await dynamoDB.send(new ScanCommand(params));
    res.json(result.Items || []);
  } catch (error) {
    console.error("Error fetching projects:", error.message);
    res.status(500).json({ error: "Failed to fetch projects." });
  }
};

// 평탄화된 데이터를 계층적으로 변환
const buildTree = (flatData) => {
  const root = [];

  // Helper: 트리 노드 탐색 및 삽입
  const findOrCreateNode = (pathParts, currentLevel) => {
    const [currentPart, ...restParts] = pathParts;

    let existingNode = currentLevel.find((node) => node.name === currentPart);

    if (!existingNode) {
      existingNode = {
        name: currentPart,
        type: restParts.length === 0 ? "file" : "folder", // 마지막 파트가 파일이면 "file", 아니면 "folder"
        children: [],
        path: pathParts.join("/"),
      };
      currentLevel.push(existingNode);
    }

    if (restParts.length > 0) {
      return findOrCreateNode(restParts, existingNode.children);
    }
    return existingNode;
  };

  flatData.forEach((item) => {
    const pathParts = item.path.split("/").filter(Boolean); // "/"로 경로를 분리하고 빈 값 제거
    findOrCreateNode(pathParts, root);
  });

  return root;
};

// ** 프로젝트 파일 트리 조회 **
exports.getProjectTree = async (req, res) => {
  const { projectId } = req.params;
  const { folderPath } = req.query; // 폴더 경로를 전달받음

  if (!projectId) {
    return res.status(400).json({ error: "Project ID가 필요합니다." });
  }

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: folderPath ? `${projectId}/${folderPath}/` : `${projectId}/`,
      Delimiter: "/",
    };

    const data = await s3Client.send(new ListObjectsV2Command(params));

    const folders = (data.CommonPrefixes || []).map((prefix) => ({
      id: prefix.Prefix,
      name: prefix.Prefix.split("/").slice(-2, -1)[0],
      path: prefix.Prefix,
      type: "folder",
    }));

    const files = (data.Contents || [])
      .filter((content) => content.Key !== params.Prefix)
      .map((file) => ({
        id: file.Key,
        name: file.Key.split("/").pop(),
        path: file.Key,
        type: "file",
      }));

    res.status(200).json({ tree: [...folders, ...files] });
  } catch (error) {
    console.error("Error fetching project tree:", error.message);
    res.status(500).json({ error: "Failed to fetch project tree." });
  }
};

// ** 파일 내용 조회 **
exports.getFileContent = async (req, res) => {
  const { projectId, filePath } = req.params;

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${projectId}/${filePath}`,
    };
    const data = await s3Client.send(new GetObjectCommand(params));
    const content = await streamToString(data.Body);
    res.status(200).json({ content });
  } catch (error) {
    console.error("Error fetching file content:", error.message);
    res.status(500).json({ error: "Failed to fetch file content." });
  }
};

// ** 폴더 생성 **
exports.createFolder = async (req, res) => {
  const { projectId, folderPath, folderName } = req.body;

  if (!projectId || !folderName) {
    return res.status(400).json({ error: "Project ID와 폴더 이름이 필요합니다." });
  }

  const folderFullPath = folderPath
    ? `${projectId}/${folderPath.replace(/^\//, "").replace(/\/$/, "")}/${folderName}/`
    : `${projectId}/${folderName}/`;

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: folderFullPath,
      Body: "",
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(201).json({ path: folderFullPath, name: folderName, type: "folder" });
  } catch (error) {
    console.error("Error creating folder:", error.message);
    res.status(500).json({ error: "Failed to create folder" });
  }
};

// ** 폴더 삭제 **
exports.deleteFolder = async (req, res) => {
  const { projectId, folderPath } = req.params;

  try {
    const listParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: `${projectId}/${folderPath}/`,
    };

    const listData = await s3Client.send(new ListObjectsV2Command(listParams));

    const deleteObjects = listData.Contents.map((obj) => ({
      Key: obj.Key,
    }));

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Delete: { Objects: deleteObjects },
      })
    );

    res.status(200).json({ message: "Folder deleted successfully." });
  } catch (error) {
    console.error("Error deleting folder:", error.message);
    res.status(500).json({ error: "Failed to delete folder." });
  }
};

// ** 파일 생성 **
exports.createFile = async (req, res) => {
  const { projectId, folderPath, fileName } = req.body;

  if (!projectId || !fileName) {
    return res.status(400).json({ error: "Project ID와 파일 이름이 필요합니다." });
  }

  // folderPath가 없을 경우를 처리하고 중복된 슬래시를 제거
  const sanitizedFolderPath = folderPath
    ? folderPath.replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "") // 중복 슬래시 제거 및 앞뒤 슬래시 처리
    : ""; // folderPath가 없을 경우 빈 문자열로 설정

  // 파일 경로 생성
  const filePath = sanitizedFolderPath
    ? `${projectId}/${sanitizedFolderPath}/${fileName}` // 폴더가 있을 경우
    : `${projectId}/${fileName}`; // 폴더가 없을 경우

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filePath,
      Body: "",
      ContentType: "text/plain",
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(201).json({ path: filePath, name: fileName, type: "file" });
  } catch (error) {
    console.error("Error creating file:", error.message);
    res.status(500).json({ error: "Failed to create file." });
  }
};

// ** 파일 삭제 **
exports.deleteFile = async (req, res) => {
  const { projectId, filePath } = req.params;

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${projectId}/${filePath}`,
    };

    await s3Client.send(new DeleteObjectCommand(params));
    res.status(200).json({ message: "File deleted successfully." });
  } catch (error) {
    console.error("Error deleting file:", error.message);
    res.status(500).json({ error: "Failed to delete file." });
  }
};

// ** 파일 내용 저장 **
exports.saveFileContent = async (req, res) => {
  const { projectId } = req.params;
  const { filePath, content } = req.body;

  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${projectId}/${filePath}`,
      Body: content,
      ContentType: "text/plain",
    };

    await s3Client.send(new PutObjectCommand(params));
    res.status(200).json({ message: "File content saved successfully." });
  } catch (error) {
    console.error("Error saving file content:", error.message);
    res.status(500).json({ error: "Failed to save file content." });
  }
};