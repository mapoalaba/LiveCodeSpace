// fileSystemController.js
const { 
  DynamoDBClient 
} = require("@aws-sdk/client-dynamodb");
const { 
  DynamoDBDocumentClient, 
  PutCommand, 
  QueryCommand, 
  GetCommand,
  UpdateCommand,
  DeleteCommand 
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// 파일/폴더 생성
exports.createItem = async (req, res) => {
  const { projectId } = req.params;
  const { name, type, parentId = 'root' } = req.body;

  try {
    const id = uuidv4();

    // 부모 폴더의 경로 가져오기
    let parentPath = '';
    if (parentId !== 'root') {
      const { Item: parentItem } = await dynamoDB.send(new GetCommand({
        TableName: "FileSystemItems",
        Key: { id: parentId }
      }));
      if (parentItem) {
        parentPath = parentItem.path;
      }
    }

    // 실제 경로 생성 (사용자가 지정한 이름 사용)
    const path = parentId === 'root'
      ? `${projectId}/${name}${type === 'folder' ? '/' : ''}`
      : `${parentPath}${name}${type === 'folder' ? '/' : ''}`;

    const item = {
      id,
      projectId,
      name,
      type,
      parentId,
      path,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // DynamoDB에 항목 저장
    await dynamoDB.send(new PutCommand({
      TableName: "FileSystemItems",
      Item: item
    }));

    // S3에 빈 객체 생성
    if (type === 'folder') {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: path,
        Body: ""
      }));
    }

    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ error: "Failed to create item" });
  }
};

// 폴더 내용 조회
exports.getChildren = async (req, res) => {
  const { projectId } = req.params;
  const { parentId = 'root' } = req.query;

  try {
    const { Items } = await dynamoDB.send(new QueryCommand({
      TableName: "FileSystemItems",
      IndexName: "ByProject",
      KeyConditionExpression: "projectId = :projectId",
      FilterExpression: "parentId = :parentId",
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":parentId": parentId
      }
    }));

    res.json({ items: Items || [] });
  } catch (error) {
    console.error("Error fetching children:", error);
    res.status(500).json({ error: "Failed to fetch items" });
  }
};

// 이름 변경
exports.renameItem = async (req, res) => {
  const { id } = req.params;
  const { newName } = req.body;

  try {
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "Item not found" });
    }

    await dynamoDB.send(new UpdateCommand({
      TableName: "FileSystemItems",
      Key: { id },
      UpdateExpression: "set #name = :name, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#name": "name"
      },
      ExpressionAttributeValues: {
        ":name": newName,
        ":updatedAt": new Date().toISOString()
      }
    }));

    res.json({ message: "Item renamed successfully" });
  } catch (error) {
    console.error("Error renaming item:", error);
    res.status(500).json({ error: "Failed to rename item" });
  }
};

// 파일/폴더 삭제
exports.deleteItem = async (req, res) => {
  const { id } = req.params;

  try {
    // 먼저 항목 정보 가져오기
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 폴더인 경우 하위 항목도 모두 삭제
    if (Item.type === 'folder') {
      const { Items: children } = await dynamoDB.send(new QueryCommand({
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "begins_with(path, :path)",
        ExpressionAttributeValues: {
          ":projectId": Item.projectId,
          ":path": Item.path
        }
      }));

      // 하위 항목 삭제
      for (const child of children || []) {
        await dynamoDB.send(new DeleteCommand({
          TableName: "FileSystemItems",
          Key: { id: child.id }
        }));
      }
    }

    // 항목 삭제
    await dynamoDB.send(new DeleteCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
};

// 파일 내용 가져오기
exports.getFileContent = async (req, res) => {
  const { id } = req.params;

  try {
    // 먼저 파일 메타데이터 가져오기
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "File not found" });
    }

    if (Item.type !== 'file') {
      return res.status(400).json({ error: "Not a file" });
    }

    // S3에서 파일 내용 가져오기
    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: Item.path
    }));

    const content = await s3Response.Body.transformToString();
    res.json({ content });
  } catch (error) {
    console.error("Error fetching file content:", error);
    res.status(500).json({ error: "Failed to fetch file content" });
  }
};

// 파일 내용 저장
exports.saveFileContent = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  try {
    // 파일 메타데이터 가져오기
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "File not found" });
    }

    if (Item.type !== 'file') {
      return res.status(400).json({ error: "Not a file" });
    }

    // S3에 파일 내용 저장
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: Item.path,
      Body: content,
      ContentType: 'text/plain'
    }));

    // 메타데이터 업데이트 (마지막 수정 시간)
    await dynamoDB.send(new UpdateCommand({
      TableName: "FileSystemItems",
      Key: { id },
      UpdateExpression: "set updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":updatedAt": new Date().toISOString()
      }
    }));

    res.json({ message: "File saved successfully" });
  } catch (error) {
    console.error("Error saving file content:", error);
    res.status(500).json({ error: "Failed to save file content" });
  }
};