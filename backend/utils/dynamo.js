const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// 프로젝트 목록 조회
const listProjects = async () => {
  const params = {
    TableName: "Projects",
  };
  const result = await dynamoDB.scan(params).promise();
  return result.Items;
};

// 새 프로젝트 생성
const createProject = async (name) => {
  const projectId = Date.now().toString(); // 고유 ID 생성
  const params = {
    TableName: "Projects",
    Item: {
      id: projectId,
      name,
      createdAt: new Date().toISOString(),
    },
  };

  await dynamoDB.put(params).promise();
  return { id: projectId, name };
};

// 파일 트리 조회
const getFileTree = async (projectId) => {
  const params = {
    TableName: "ProjectFiles",
    KeyConditionExpression: "projectId = :projectId",
    ExpressionAttributeValues: {
      ":projectId": projectId,
    },
  };
  const result = await dynamoDB.query(params).promise();
  const tree = {};
  result.Items.forEach((item) => {
    const parts = item.filePath.split("/");
    let current = tree;
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          type: index === parts.length - 1 ? item.type : "folder",
          children: {},
        };
      }
      current = current[part].children;
    });
  });
  return tree;
};

module.exports = { listProjects, createProject, getFileTree };