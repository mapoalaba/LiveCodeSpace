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
  DeleteCommand,
  ScanCommand
} = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand,  // 추가된 import
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand
} = require("@aws-sdk/client-s3");

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });



/**
 * 파일 또는 폴더 생성
 * 1. DynamoDB에 메타데이터 저장
 * 2. S3에 파일/폴더 생성
 */
exports.createItem = async (req, res) => {
  try {
    console.log("전체 요청 객체:", {
      params: req.params,
      body: req.body,
      query: req.query
    });

    const { projectId } = req.params;
    const { name, type, parentId = 'root' } = req.body;

    // 필수 필드 검증
    if (!projectId) {
      return res.status(400).json({
        error: "projectId가 필요합니다",
        received: { params: req.params }
      });
    }

    if (!name || !type) {
      return res.status(400).json({
        error: "name과 type이 필요합니다",
        received: { body: req.body }
      });
    }

    // 고유 ID 생성
    const id = uuidv4();
    console.log("생성된 UUID:", id);
    
    if (!id || typeof id !== 'string' || id.length === 0) {
      throw new Error("UUID 생성 실패");
    }

    // 부모 폴더 경로 처리
    let parentPath = `${projectId}/`;  // 기본 경로를 프로젝트 ID로 시작
    if (parentId && parentId !== 'root') {
      console.log("부모 폴더 조회:", parentId);
      const { Item: parentItem } = await dynamoDB.send(new GetCommand({
        TableName: "FileSystemItems",
        Key: { id: parentId }
      }));
      
      console.log("조회된 부모 폴더:", parentItem);
      
      if (!parentItem) {
        return res.status(404).json({ 
          error: "상위 폴더를 찾을 수 없습니다",
          parentId 
        });
      }
      parentPath = parentItem.path;
    }

    // 파일/폴더 경로 생성
    const path = `${parentPath}${name}${type === 'folder' ? '/' : ''}`;
    console.log("생성된 경로:", path);

    // 메타데이터 객체 생성
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

    console.log("생성할 아이템:", JSON.stringify(item, null, 2));

    // DynamoDB에 메타데이터 저장
    await dynamoDB.send(new PutCommand({
      TableName: "FileSystemItems",
      Item: item,
      ConditionExpression: "attribute_not_exists(id)"
    }));

    // S3에 파일/폴더 생성
    if (type === 'file') {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: path,
        Body: "",
        ContentType: 'text/plain'
      }));
    } else if (type === 'folder') {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: path,
        Body: Buffer.from('')
      }));
    }

    res.status(201).json(item);
  } catch (error) {
    console.error("상세 에러 정보:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });

    res.status(500).json({
      error: "아이템 생성 실패",
      message: error.message,
      type: error.name
    });
  }
};

// 폴더 내용 조회
exports.getChildren = async (req, res) => {
  const { projectId } = req.params;
  const { parentId = 'root' } = req.query;

  try {
    console.log("폴더 조회 요청:", {
      projectId,
      parentId,
      params: req.params,
      query: req.query
    });

    let queryParams;
    if (parentId === 'root' || parentId === '') {
      // 루트 폴더 조회
      queryParams = {
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "parentId = :parentId",
        ExpressionAttributeValues: {
          ":projectId": projectId,
          ":parentId": ""
        }
      };
    } else {
      // 하위 폴더 조회
      queryParams = {
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "parentId = :parentId",
        ExpressionAttributeValues: {
          ":projectId": projectId,
          ":parentId": parentId
        }
      };
    }

    console.log("DynamoDB 쿼리 파라미터:", JSON.stringify(queryParams, null, 2));

    const { Items } = await dynamoDB.send(new QueryCommand(queryParams));
    
    console.log("조회된 아이템:", JSON.stringify(Items, null, 2));

    // 아이템이 없을 경우 빈 배열 반환
    if (!Items || Items.length === 0) {
      console.log("조회된 아이템 없음");
      return res.json({ items: [] });
    }

    // 응답 전에 아이템 형식 확인
    const formattedItems = Items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      path: item.path,
      parentId: item.parentId,
      projectId: item.projectId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    console.log("응답할 아이템:", JSON.stringify(formattedItems, null, 2));

    res.json({ items: formattedItems });
  } catch (error) {
    console.error("폴더 조회 에러:", {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack
    });
    
    res.status(500).json({ 
      error: "폴더 조회 실패",
      details: error.message 
    });
  }
}

// 이름 변경
exports.renameItem = async (req, res) => {
  const { id } = req.params;
  const { newName } = req.body;

  try {
    // 1. 현재 항목 정보 조회
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "항목을 찾을 수 없습니다" });
    }

    // 2. 새로운 경로 계산
    const oldPath = Item.path;
    const pathParts = oldPath.split('/');
    pathParts.pop(); // 마지막 부분(이전 이름) 제거
    const newPath = [...pathParts, newName].join('/') + (Item.type === 'folder' ? '/' : '');

    // 3. S3에서 파일/폴더 이동
    if (Item.type === 'folder') {
      // 폴더인 경우 하위 항목들의 경로도 모두 업데이트
      const { Items: children } = await dynamoDB.send(new QueryCommand({
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "begins_with(#itemPath, :pathValue)",
        ExpressionAttributeNames: {
          "#itemPath": "path"
        },
        ExpressionAttributeValues: {
          ":projectId": Item.projectId,
          ":pathValue": oldPath
        }
      }));

      // 하위 항목들의 경로 업데이트
      for (const child of children || []) {
        const newChildPath = child.path.replace(oldPath, newPath);
        await dynamoDB.send(new UpdateCommand({
          TableName: "FileSystemItems",
          Key: { id: child.id },
          UpdateExpression: "set #itemPath = :newPath, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#itemPath": "path"
          },
          ExpressionAttributeValues: {
            ":newPath": newChildPath,
            ":updatedAt": new Date().toISOString()
          }
        }));

        // S3 객체 복사 및 삭제
        if (child.type === 'file') {
          await s3Client.send(new CopyObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            CopySource: `${process.env.S3_BUCKET_NAME}/${child.path}`,
            Key: newChildPath
          }));
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: child.path
          }));
        }
      }
    } else {
      // 파일인 경우 S3 객체 복사 및 삭제
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

    // 4. 현재 항목의 이름과 경로 업데이트
    await dynamoDB.send(new UpdateCommand({
      TableName: "FileSystemItems",
      Key: { id },
      UpdateExpression: "set #name = :name, #itemPath = :newPath, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#name": "name",
        "#itemPath": "path"
      },
      ExpressionAttributeValues: {
        ":name": newName,
        ":newPath": newPath,
        ":updatedAt": new Date().toISOString()
      }
    }));

    // 5. 현재 폴더의 내용 다시 조회
    const { Items: updatedItems } = await dynamoDB.send(new QueryCommand({
      TableName: "FileSystemItems",
      IndexName: "ByProject",
      KeyConditionExpression: "projectId = :projectId",
      FilterExpression: "parentId = :parentId",
      ExpressionAttributeValues: {
        ":projectId": Item.projectId,
        ":parentId": Item.parentId
      }
    }));

    // 6. 응답 전송
    res.json({
      message: "이름이 성공적으로 변경되었습니다",
      updatedItem: {
        ...Item,
        name: newName,
        path: newPath,
        updatedAt: new Date().toISOString()
      },
      updatedItems: updatedItems || []
    });

  } catch (error) {
    console.error("이름 변경 중 오류:", error);
    res.status(500).json({ 
      error: "이름 변경에 실패했습니다",
      details: error.message 
    });
  }
}

// 파일/폴더 삭제
exports.deleteItem = async (req, res) => {
  const { id } = req.params;

  try {
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "삭제할 항목을 찾을 수 없습니다" });
    }

    if (Item.type === 'folder') {
      const { Items: children } = await dynamoDB.send(new QueryCommand({
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "begins_with(#itemPath, :pathValue)",
        ExpressionAttributeNames: {
          "#itemPath": "path"
        },
        ExpressionAttributeValues: {
          ":projectId": Item.projectId,
          ":pathValue": Item.path
        }
      }));

      for (const child of children || []) {
        await dynamoDB.send(new DeleteCommand({
          TableName: "FileSystemItems",
          Key: { id: child.id }
        }));

        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: child.path
        }));
      }
    }

    await dynamoDB.send(new DeleteCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: Item.path
    }));

    res.json({
      message: "항목이 성공적으로 삭제되었습니다",
      deletedItem: Item
    });

  } catch (error) {
    console.error("삭제 중 오류 발생:", error);
    res.status(500).json({ error: "항목 삭제 실패" });
  }
};

// 파일 내용 가져오기
exports.getFileContent = async (req, res) => {
  const { id } = req.params;

  try {
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    }

    if (Item.type !== 'file') {
      return res.status(400).json({ error: "해당 항목은 파일이 아닙니다." });
    }

    const s3Response = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: Item.path
    }));

    const content = await s3Response.Body.transformToString();
    res.json({ content });
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return res.json({ content: '' });  // 새 파일의 경우 빈 내용 반환
    }
    res.status(500).json({ error: "파일 내용을 가져오는데 실패했습니다." });
  }
};

// 파일 내용 저장
exports.saveFileContent = async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  try {
    const { Item } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!Item) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    }

    if (Item.type !== 'file') {
      return res.status(400).json({ error: "해당 항목은 파일이 아닙니다." });
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: Item.path,
      Body: content,
      ContentType: 'text/plain'
    }));

    await dynamoDB.send(new UpdateCommand({
      TableName: "FileSystemItems",
      Key: { id },
      UpdateExpression: "set updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":updatedAt": new Date().toISOString()
      }
    }));

    res.json({ message: "파일이 성공적으로 저장되었습니다." });
  } catch (error) {
    res.status(500).json({ error: "파일 저장에 실패했습니다." });
  }
};

// 드래그 앤 드롭
exports.moveItem = async (req, res) => {
  const { id } = req.params;
  const { newParentId } = req.body;

  try {
    // 이동할 항목 조회
    const { Item: itemToMove } = await dynamoDB.send(new GetCommand({
      TableName: "FileSystemItems",
      Key: { id }
    }));

    if (!itemToMove) {
      return res.status(404).json({ error: "아이템을 찾을 수 없습니다." });
    }

    // 새로운 경로 계산
    let newPath;
    if (!newParentId || newParentId === "") {
      // 루트로 이동
      newPath = `${itemToMove.projectId}/${itemToMove.name}${itemToMove.type === 'folder' ? '/' : ''}`;
    } else {
      // 다른 폴더로 이동
      const { Item: newParent } = await dynamoDB.send(new GetCommand({
        TableName: "FileSystemItems",
        Key: { id: newParentId }
      }));

      if (!newParent) {
        return res.status(404).json({ error: "대상 폴더를 찾을 수 없습니다." });
      }

      newPath = `${newParent.path}${itemToMove.name}${itemToMove.type === 'folder' ? '/' : ''}`;
    }

    // S3 객체 이동
    await s3Client.send(new CopyObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      CopySource: `${process.env.S3_BUCKET_NAME}/${itemToMove.path}`,
      Key: newPath
    }));

    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: itemToMove.path
    }));

    // DynamoDB 업데이트
    await dynamoDB.send(new UpdateCommand({
      TableName: "FileSystemItems",
      Key: { id },
      UpdateExpression: "set #itemPath = :newPath, parentId = :newParentId, updatedAt = :updatedAt",
      ExpressionAttributeNames: {
        "#itemPath": "path"
      },
      ExpressionAttributeValues: {
        ":newPath": newPath,
        ":newParentId": newParentId || "",
        ":updatedAt": new Date().toISOString()
      }
    }));

    // 폴더인 경우 하위 항목들의 경로도 업데이트
    if (itemToMove.type === 'folder') {
      const { Items: children } = await dynamoDB.send(new QueryCommand({
        TableName: "FileSystemItems",
        IndexName: "ByProject",
        KeyConditionExpression: "projectId = :projectId",
        FilterExpression: "begins_with(#itemPath, :pathPrefix)",
        ExpressionAttributeNames: {
          "#itemPath": "path"
        },
        ExpressionAttributeValues: {
          ":projectId": itemToMove.projectId,
          ":pathPrefix": itemToMove.path
        }
      }));

      for (const child of children || []) {
        const newChildPath = child.path.replace(itemToMove.path, newPath);
        await dynamoDB.send(new UpdateCommand({
          TableName: "FileSystemItems",
          Key: { id: child.id },
          UpdateExpression: "set #itemPath = :newPath, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#itemPath": "path"
          },
          ExpressionAttributeValues: {
            ":newPath": newChildPath,
            ":updatedAt": new Date().toISOString()
          }
        }));
      }
    }

    res.json({ message: "아이템이 성공적으로 이동되었습니다." });
  } catch (error) {
    console.error("Error moving item:", error);
    res.status(500).json({ error: "Failed to move item" });
  }
};

// 검색 기능 추가
exports.searchItems = async (req, res) => {
  const { projectId } = req.params;
  const { query } = req.query;

  try {
    const { Items } = await dynamoDB.send(new QueryCommand({
      TableName: "FileSystemItems",
      IndexName: "ByProject",
      KeyConditionExpression: "projectId = :projectId",
      FilterExpression: "contains(#name, :query)",
      ExpressionAttributeNames: {
        "#name": "name"
      },
      ExpressionAttributeValues: {
        ":projectId": projectId,
        ":query": query
      }
    }));

    res.json({ items: Items || [] });
  } catch (error) {
    console.error("Error searching items:", error);
    res.status(500).json({ error: "Failed to search items" });
  }
};