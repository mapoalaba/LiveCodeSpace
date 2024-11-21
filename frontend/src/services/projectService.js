export const getProjects = async () => {
  const response = await fetch("/api/projects");
  return response.json();
};