import { useEffect, useState } from "react";
import { createProject, getEngineers } from "../api";

const CreateProject = () => {
  const [name, setName] = useState("");
  const [engineers, setEngineers] = useState([]);
  const [selectedEngineers, setSelectedEngineers] = useState([]);

  // ✅ Load engineers from backend
  useEffect(() => {
    loadEngineers();
  }, []);

  const loadEngineers = async () => {
    const data = await getEngineers();
    setEngineers(data);
  };

  // ✅ Handle multi-select
  const handleSelect = (e) => {
    const options = Array.from(e.target.selectedOptions);
    const values = options.map((opt) => opt.value);
    setSelectedEngineers(values);
  };

  const handleSubmit = async () => {
    await createProject({
      name,
      assignedTo: selectedEngineers, // ✅ correct format
    });

    alert("Project created");
  };

  return (
    <div>
      <h2>Create Project</h2>

      <input
        placeholder="Project Name"
        onChange={(e) => setName(e.target.value)}
      />

      {/* ✅ ENGINEER DROPDOWN */}
      <select multiple onChange={handleSelect}>
        {engineers.map((eng) => (
          <option key={eng._id} value={eng._id}>
            {eng.name} ({eng.email})
          </option>
        ))}
      </select>

      <button onClick={handleSubmit}>Create</button>
    </div>
  );
};

export default CreateProject;
