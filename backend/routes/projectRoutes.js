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
  renameItem,
  deleteProject,
  inviteToProject,
  acceptInvitation,
  getInvitations,
  getProjectMembers, // Add this line
} = require("../controllers/projectController");

const router = express.Router();

// 오류 처리 미들웨어 추가
const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// 초대 관련 라우트들을 상단으로 이동하고 경로 수정
router.get("/invitations", verifyToken, asyncHandler(getInvitations)); // 초대 목록 조회를 먼저 정의
router.post("/:projectId/invite", verifyToken, asyncHandler(inviteToProject));
router.post("/:projectId/accept", verifyToken, asyncHandler(acceptInvitation));

// 사용자 프로젝트 목록 조회
router.get("/", verifyToken, getUserProjects);

// 새 프로젝트 생성
router.post("/", verifyToken, createProject);

// 특정 프로젝트 상세 조회
router.get("/:projectId", verifyToken, getProjectById);

// 프로젝트 삭제 라우트 추가
router.delete("/:projectId", verifyToken, deleteProject);

// 프로젝트 트리 조회
router.get("/:projectId/tree", verifyToken, getProjectTree);

// 폴더 생성
router.post("/:projectId/folders", verifyToken, createFolder);

// 파일 생성
router.post("/:projectId/files", verifyToken, createFile);

// 파일 삭제
router.delete('/:projectId/files', verifyToken, deleteFile);

// 폴더 삭제
router.delete('/:projectId/folders', verifyToken, deleteFolder);

// 폴더 및 파일 이름 변경
router.put('/:projectId/rename', verifyToken, renameItem);

// 프로젝트 멤버 조회
router.get("/:projectId/members", verifyToken, getProjectMembers);

// 글로벌 에러 핸들러 추가
router.use((err, req, res, next) => {
  console.error("라우트 에러:", err);
  res.status(500).json({
    error: "서버 오류가 발생했습니다.",
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = router;