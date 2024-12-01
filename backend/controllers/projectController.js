const { DynamoDBDocumentClient, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");

// AWS DynamoDB 설정
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

// GET /projects: 사용자 프로젝트 목록 조회
exports.getUserProjects = async (req, res) => {
  const { userId } = req.user; // JWT에서 추출된 사용자 ID
  console.log("Fetching projects for user:", userId);

  const params = {
    TableName: "Projects",
    KeyConditionExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": userId,
    },
  };

  try {
    const result = await dynamoDB.send(new QueryCommand(params));
    console.log("Projects retrieved:", result.Items);
    res.json(result.Items || []);
  } catch (error) {
    console.error("Error fetching projects:", error.message);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
};

// POST /projects: 새 프로젝트 생성
exports.createProject = async (req, res) => {
  const { projectName } = req.body;
  const { userId } = req.user;

  if (!userId) {
    console.error("User ID is missing in request.");
    return res.status(400).json({ error: "User ID is required." });
  }

  if (!projectName || !projectName.trim()) {
    return res.status(400).json({ error: "Project name cannot be empty." });
  }

  const newProject = {
    userId, // DynamoDB Partition Key
    projectId: `proj-${Date.now()}`, // 고유 Project ID
    projectName: projectName.trim(),
    createdAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  };

  try {
    await dynamoDB.send(new PutCommand({ TableName: "Projects", Item: newProject }));
    console.log("Project created:", newProject);
    res.status(201).json({ message: "Project created successfully", project: newProject });
  } catch (error) {
    console.error("Error creating project:", error.message);
    res.status(500).json({ error: "Failed to create project." });
  }
};