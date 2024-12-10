const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const BUCKET_NAME = "workspace-projects-livecodespace";

// 파일 업로드
const uploadFileToS3 = async (projectId, filePath, content) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: `projects/${projectId}/${filePath}`,
    Body: content,
  };
  await s3.putObject(params).promise();
};

// 파일 다운로드
const downloadFileFromS3 = async (projectId, filePath) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: `projects/${projectId}/${filePath}`,
  };
  const result = await s3.getObject(params).promise();
  return result.Body.toString("utf-8");
};

module.exports = { uploadFileToS3, downloadFileFromS3 };