// components/TerminalTabs.js
import React from 'react';
import { Icon } from '@mdi/react';
import { mdiPlus, mdiClose } from '@mdi/js';

const TerminalTabs = ({ 
  terminals, 
  activeId, 
  onSelect, 
  onAdd, 
  onClose 
}) => {
  return (
    <div className="terminal-tabs">
      {terminals.map(terminal => (
        <div
          key={terminal.id}
          className={`terminal-tab ${terminal.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(terminal.id)}
        >
          <span>{terminal.title || `Terminal ${terminal.id}`}</span>
          {terminals.length > 1 && (
            <button 
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                onClose(terminal.id);
              }}
            >
              <Icon path={mdiClose} size={0.6} />
            </button>
          )}
        </div>
      ))}
      <button className="add-terminal" onClick={onAdd}>
        <Icon path={mdiPlus} size={0.8} />
      </button>
    </div>
  );
};

export default TerminalTabs;