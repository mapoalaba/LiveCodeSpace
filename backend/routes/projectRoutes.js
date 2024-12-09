const express = require("express");
const { verifyToken } = require("../controllers/authController");
const {
  getUserProjects,
  createProject,
  getProjectById,
  getProjectTree,
  createFolder,
  createFile,
  deleteFile,
  deleteFolder,
} = require("../controllers/projectController");

const router = express.Router();

// 사용자 프로젝트 목록 조회
router.get("/", verifyToken, getUserProjects);

// 새 프로젝트 생성
router.post("/", verifyToken, createProject);

// 특정 프로젝트 상세 조회
router.get("/:projectId", verifyToken, getProjectById);

// 프로젝트 트리 조회
router.get("/:projectId/tree", verifyToken, getProjectTree);

// 폴더 생성
router.post("/:projectId/folders", verifyToken, createFolder);

// 파일 생성
router.post("/:projectId/files", verifyToken, createFile);

// 폴더 삭제
router.delete("/:projectId/folders/:folderPath", verifyToken, deleteFolder);

// 파일 삭제
router.delete("/:projectId/files/:filePath", verifyToken, deleteFile);

module.exports = router;