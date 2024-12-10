// 사용

const UnsavedChangesIndicator = ({ hasUnsavedChanges, autoSave }) => (
  <div className="unsaved-changes-indicator">
    {hasUnsavedChanges && !autoSave && (
      <span className="unsaved-dot" title="저장되지 않은 변경사항이 있습니다">●</span>
    )}
    {autoSave && hasUnsavedChanges && (
      <span className="autosave-indicator">자동 저장 중...</span>
    )}
  </div>
);