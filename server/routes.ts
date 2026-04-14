import express from "express";
import Project from "../models/Project";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = express.Router();


// ==============================
// ✅ CREATE PROJECT
// ==============================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) return res.status(400).json({ message: "Wrong password" });

  const token = jwt.sign(
    {
      id: user._id.toString(), // ✅ REQUIRED
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    user: {
      id: user._id,
      role: user.role,
    },
  });
});

    return res.status(201).json(project);
  } catch (err) {
    console.error("CREATE ERROR:", err);
    return res.status(500).json({ error: "Failed to create project" });
  }
});


// ==============================
// ✅ GET PROJECTS (FIXED FILTER)
// ==============================
router.get("/projects", authMiddleware, async (req, res) => {
  const user = req.user;

  let projects;

  if (user.role === "admin") {
    projects = await Project.find();
  } else {
    projects = await Project.find({
      assignedTo: { $in: [user.id] }, // ✅ FIX
    });
  }

  res.json(projects);
});


// ==============================
// ✅ GET SINGLE PROJECT
// ==============================
router.get("/projects/:id", authMiddleware, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json(project);
  } catch (err) {
    console.error("GET ONE ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch project" });
  }
});


// ==============================
// ✅ UPDATE PROJECT (SAFE)
// ==============================
router.put("/projects/:id", authMiddleware, async (req, res) => {
  try {
    const updated = await Project.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...req.body,
          ...(req.body.assignedTo && {
            assignedTo: Array.isArray(req.body.assignedTo)
              ? req.body.assignedTo
              : [req.body.assignedTo],
          }),
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json(updated);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    return res.status(500).json({ error: "Update failed" });
  }
});


// ==============================
// ✅ DELETE PROJECT
// ==============================
router.delete("/projects/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await Project.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    return res.status(500).json({ error: "Delete failed" });
  }
});


export default router;
