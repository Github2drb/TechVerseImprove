import { createProject } from "../api";

const handleSubmit = async () => {
  await createProject({
    name,
    description,
    assignedTo, // can be string → api will fix
  });

  alert("Project created");
};