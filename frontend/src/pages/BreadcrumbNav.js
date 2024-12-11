// 사용

const BreadcrumbNav = ({ path, onPathClick }) => {
  const parts = path.split('/').filter(Boolean);
  const paths = parts.map((_, index) => parts.slice(0, index + 1).join('/'));

  return (
    <div className="breadcrumb">
      <span 
        className="breadcrumb-item"
        onClick={() => onPathClick("")}
      >
        root
      </span>
      {parts.map((part, index) => (
        <span key={index}>
          <span className="breadcrumb-separator">/</span>
          <span 
            className="breadcrumb-item"
            onClick={() => onPathClick(paths[index])}
          >
            {part}
          </span>
        </span>
      ))}
    </div>
  );
};