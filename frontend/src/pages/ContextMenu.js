// 사용

const ContextMenu = ({ x, y, onClose, actions }) => {
  useEffect(() => {
    const handleClickOutside = () => onClose();
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  return (
    <div 
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      {actions.map(action => (
        <div 
          key={action.label} 
          className="context-menu-item"
          onClick={() => {
            action.handler();
            onClose();
          }}
        >
          <span className="context-menu-icon">{action.icon}</span>
          <span>{action.label}</span>
        </div>
      ))}
    </div>
  );
};