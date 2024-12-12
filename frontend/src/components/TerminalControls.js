// components/TerminalControls.js
import React from 'react';
import { Icon } from '@mdi/react';
import { 
  mdiArrowDown, 
  mdiArrowRight,
  mdiViewSplitVertical,
  mdiMagnify,
  mdiClose 
} from '@mdi/js';

const TerminalControls = ({ 
  position, 
  onPositionChange, 
  onSplit, 
  onSearchToggle,
  onClose 
}) => {
  return (
    <div className="terminal-controls">
      <button
        className="control-btn"
        onClick={onPositionChange}
        title={position === 'bottom' ? '우측으로 이동' : '하단으로 이동'}
      >
        <Icon 
          path={position === 'bottom' ? mdiArrowRight : mdiArrowDown}
          size={0.8}
        />
      </button>
      <button
        className="control-btn"
        onClick={onSplit}
        title="터미널 분할"
      >
        <Icon path={mdiViewSplitVertical} size={0.8} />
      </button>
      <button
        className="control-btn"
        onClick={onSearchToggle}
        title="터미널 검색"
      >
        <Icon path={mdiMagnify} size={0.8} />
      </button>
      <button
        className="control-btn"
        onClick={onClose}
        title="터미널 닫기"
      >
        <Icon path={mdiClose} size={0.8} />
      </button>
    </div>
  );
};

export default TerminalControls;