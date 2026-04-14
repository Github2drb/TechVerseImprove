import { useEffect, useState } from "react";
import { getProjects } from "../api";

const Dashboard = () => {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await getProjects();

      // ✅ DO NOT FILTER HERE
      setProjects(data);
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <div>
      <h2>Projects</h2>

      {projects.length === 0 ? (
        <p>No projects available</p>
      ) : (
        projects.map((p) => (
          <div key={p._id}>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
          </div>
        ))
      )}
    </div>
  );
};

export default Dashboard;
