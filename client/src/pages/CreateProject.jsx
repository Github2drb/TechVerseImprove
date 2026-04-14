import { useState } from "react";
import { createProject } from "../api";

const CreateProject = () => {
  const [name, setName] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const handleSubmit = async () => {
    await createProject({
      name,
      assignedTo, // string → converted to array in API
    });

    alert("Created");
  };

  return (
    <div>
      <input
        placeholder="Project Name"
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Assign User ID"
        onChange={(e) => setAssignedTo(e.target.value)}
      />

      <button onClick={handleSubmit}>Create</button>
    </div>
  );
};

export default CreateProject;
