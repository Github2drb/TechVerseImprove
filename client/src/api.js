const API_BASE = "https://your-render-url.onrender.com/api";

// ✅ Attach token to every request
const getHeaders = () => {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

// ✅ GET PROJECTS
export const getProjects = async () => {
  const res = await fetch(`${API_BASE}/projects`, {
    headers: getHeaders(),
  });

  if (!res.ok) throw new Error("Failed to fetch projects");

  return res.json();
};

// ✅ CREATE PROJECT
export const createProject = async (data) => {
  const res = await fetch(`${API_BASE}/projects`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      ...data,
      assignedTo: Array.isArray(data.assignedTo)
        ? data.assignedTo
        : [data.assignedTo], // 🔥 FIX
    }),
  });

  return res.json();
};

// ✅ UPDATE PROJECT
export const updateProject = async (id, data) => {
  const res = await fetch(`${API_BASE}/projects/${id}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  return res.json();
};

// ✅ DELETE PROJECT
export const deleteProject = async (id) => {
  await fetch(`${API_BASE}/projects/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
};