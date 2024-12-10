const FileTree = ({ tree }) => {
  const renderTree = (node) => {
    return Object.keys(node).map((key) => (
      <div key={key} style={{ marginLeft: "20px" }}>
        {node[key].type === "folder" ? "📂" : "📄"} {key}
        {node[key].children && renderTree(node[key].children)}
      </div>
    ));
  };

  return <div>{renderTree(tree)}</div>;
};

export default FileTree;