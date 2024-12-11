// components/TerminalSearch.js
import React, { useState } from 'react';
import { Icon } from '@mdi/react';
import { mdiMagnify, mdiArrowUp, mdiArrowDown, mdiClose } from '@mdi/js';

const TerminalSearch = ({ onSearch, onNext, onPrevious, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="terminal-search">
      <div className="search-input-container">
        <Icon path={mdiMagnify} size={0.8} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onSearch(e.target.value);
          }}
          placeholder="터미널 검색..."
        />
      </div>
      <div className="search-controls">
        <button onClick={onPrevious}>
          <Icon path={mdiArrowUp} size={0.8} />
        </button>
        <button onClick={onNext}>
          <Icon path={mdiArrowDown} size={0.8} />
        </button>
        <button onClick={onClose}>
          <Icon path={mdiClose} size={0.8} />
        </button>
      </div>
    </div>
  );
};

export default TerminalSearch;