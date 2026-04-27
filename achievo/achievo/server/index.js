const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("./db/db");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const app = express();

const formatDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }

  const text = String(value);

  // Only format actual ISO date strings like 2026-04-27T00:00:00
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return text.split("T")[0];
  }

  return text;
};
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/profile");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user-${req.user.userId}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/gif"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only jpg, png, and gif are allowed"));
    }

    cb(null, true);
  },
});
app.get("/tasks/:id/comments", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT task_comments.*, users.name AS user_name, users.profile_image
       FROM task_comments
       JOIN users ON task_comments.user_id = users.id
       WHERE task_comments.task_id = $1
       ORDER BY task_comments.created_at ASC`,
      [req.params.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch comments error:", err.message);
    res.status(500).json({ message: "Failed to fetch comments" });
  }
});

app.post("/tasks/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: "Comment is required" });
    }

    const result = await pool.query(
      `INSERT INTO task_comments (task_id, user_id, comment)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.userId, comment.trim()],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create comment error:", err.message);
    res.status(500).json({ message: "Failed to save comment" });
  }
});
app.delete(
  "/tasks/:taskId/comments/:commentId",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM task_comments
       WHERE id = $1 AND task_id = $2 AND user_id = $3
       RETURNING *`,
        [req.params.commentId, req.params.taskId, req.user.userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }

      res.json({ message: "Comment deleted" });
    } catch (err) {
      console.error("Delete comment error:", err.message);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  },
);

app.delete(
  "/tasks/:taskId/attachments/:attachmentId",
  authMiddleware,
  async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM task_attachments
       WHERE id = $1 AND task_id = $2 AND user_id = $3
       RETURNING *`,
        [req.params.attachmentId, req.params.taskId, req.user.userId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      res.json({ message: "Attachment deleted" });
    } catch (err) {
      console.error("Delete attachment error:", err.message);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  },
);
const taskFileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/tasks");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `task-${req.params.id}-${Date.now()}${ext}`);
  },
});

const taskUpload = multer({ storage: taskFileStorage });

app.get("/tasks/:id/attachments", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM task_attachments
       WHERE task_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.user.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch attachments error:", err.message);
    res.status(500).json({ message: "Failed to fetch attachments" });
  }
});

app.post(
  "/tasks/:id/attachments",
  authMiddleware,
  taskUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const filePath = `/uploads/tasks/${req.file.filename}`;

      const result = await pool.query(
        `INSERT INTO task_attachments (task_id, user_id, original_name, file_path)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.id, req.user.userId, req.file.originalname, filePath],
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Upload attachment error:", err.message);
      res.status(500).json({ message: "Failed to upload attachment" });
    }
  },
);
app.get("/tasks/:id/links", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM task_links
       WHERE task_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [req.params.id, req.user.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch links error:", err.message);
    res.status(500).json({ message: "Failed to fetch links" });
  }
});

app.post("/tasks/:id/links", authMiddleware, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({ message: "Link is required" });
    }

    const result = await pool.query(
      `INSERT INTO task_links (task_id, user_id, url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.user.userId, url.trim()],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create link error:", err.message);
    res.status(500).json({ message: "Failed to save link" });
  }
});
app.delete("/tasks/:taskId/links/:linkId", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM task_links
       WHERE id = $1 AND task_id = $2 AND user_id = $3
       RETURNING *`,
      [req.params.linkId, req.params.taskId, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Link not found" });
    }

    res.json({ message: "Link deleted" });
  } catch (err) {
    console.error("Delete link error:", err.message);
    res.status(500).json({ message: "Failed to delete link" });
  }
});
app.get("/notifications", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT tasks.*,
             categories.name AS category_name,
             categories.color AS category_color
      FROM tasks
      LEFT JOIN categories ON tasks.category_id = categories.id
      WHERE tasks.user_id = $1
        AND tasks.notification_date IS NOT NULL
        AND tasks.notification_time IS NOT NULL
     AND (
  tasks.notification_date::date + tasks.notification_time::time
) <= LOCALTIMESTAMP
      ORDER BY tasks.notification_date DESC, tasks.notification_time DESC
      `,
      [req.user.userId],
    );

    res.json(
      result.rows.map((task) => ({
        ...task,
        notification_date: formatDateOnly(task.notification_date),
        task_custom_date: formatDateOnly(task.task_custom_date),
      })),
    );
  } catch (err) {
    console.error("Fetch notifications error:", err.message);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});
app.get("/notifications/unread-count", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*) FROM tasks
      WHERE user_id = $1
        AND is_read = FALSE
        AND notification_date IS NOT NULL
        AND notification_time IS NOT NULL
        AND (
          notification_date::date + notification_time::time
        ) <= LOCALTIMESTAMP
      `,
      [req.user.userId],
    );

    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error("Unread count error:", err.message);
    res.status(500).json({ message: "Failed to fetch count" });
  }
});
app.put("/notifications/mark-read", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE tasks
      SET is_read = TRUE
      WHERE user_id = $1
        AND is_read = FALSE
        AND notification_date IS NOT NULL
        AND notification_time IS NOT NULL
        AND (
          notification_date::date + notification_time::time
        ) <= LOCALTIMESTAMP
      `,
      [req.user.userId],
    );

    res.json({ message: "Notifications marked as read" });
  } catch (err) {
    console.error("Mark read error:", err.message);
    res.status(500).json({ message: "Failed to mark notifications as read" });
  }
});
app.get("/tasks", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tasks.*, categories.name AS category_name, categories.color AS category_color
   FROM tasks
   LEFT JOIN categories ON tasks.category_id = categories.id
   WHERE tasks.user_id = $1
   ORDER BY tasks.id DESC`,
      [req.user.userId],
    );

    res.json(
      result.rows.map((task) => ({
        ...task,
        notification_date: formatDateOnly(task.notification_date),
        task_custom_date: formatDateOnly(task.task_custom_date),
      })),
    );
  } catch (err) {
    console.error("Fetch tasks error:", err);
    res.status(500).json({
      message: "Failed to fetch tasks",
      error: err.message,
    });
  }
});

app.post("/tasks", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      category_id,
      priority,
      task_day_option,
      task_custom_date,
      notification_date,
      notification_time,
      description,
    } = req.body;
    if (
      !title ||
      !category_id ||
      !priority ||
      !task_day_option ||
      !notification_date ||
      !notification_time ||
      (task_day_option === "custom" && !task_custom_date)
    ) {
      return res.status(400).json({
        message: "Missing required fields. Only description is optional.",
      });
    }
    const finalNotificationDate = notification_date
      ? notification_date.split("T")[0]
      : null;

    console.log("TASK BODY RECEIVED:", req.body);
    console.log(
      "NOTIFICATION TO SAVE:",
      notification_date.split("T")[0],
      notification_time,
    );
    const result = await pool.query(
      `INSERT INTO tasks (
    title,
    user_id,
    category_id,
    priority,
    completed,
    task_day_option,
    task_custom_date,
    notification_date,
    notification_time,
    description
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        title,
        req.user.userId,
        category_id,
        priority,
        false,
        task_day_option,
        task_custom_date || null,
        finalNotificationDate,
        notification_time,
        description || "",
      ],
    );
    res.status(201).json({
      ...result.rows[0],
      notification_date: formatDateOnly(result.rows[0].notification_date),
      task_custom_date: formatDateOnly(result.rows[0].task_custom_date),
    });
  } catch (err) {
    console.error("Create task error:", err);
    res.status(500).json({
      message: "Failed to create task",
      error: err.message,
    });
  }
});

app.put("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    const existingTask = await pool.query(
      "SELECT * FROM tasks WHERE id = $1 AND user_id = $2",
      [id, req.user.userId],
    );

    if (existingTask.rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    const oldTask = existingTask.rows[0];

    const {
      title,
      completed,
      category_id,
      priority,
      task_day_option,
      task_custom_date,
      notification_date,
      notification_time,
      description,
    } = req.body;
    console.log("UPDATE TASK BODY RECEIVED:", req.body);
    console.log("OLD TASK:", oldTask);
    const finalNotificationDate = notification_date
      ? notification_date.split("T")[0]
      : oldTask.notification_date;

    const finalNotificationTime = notification_time
      ? notification_time.slice(0, 5)
      : oldTask.notification_time;

    const result = await pool.query(
      `
      WITH updated_task AS (
        UPDATE tasks
        SET title = $1,
            completed = $2,
            category_id = $3,
            priority = $4,
            task_day_option = $5,
            task_custom_date = $6,
            notification_date = $7,
            notification_time = $8,
            description = $9
        WHERE id = $10 AND user_id = $11
        RETURNING *
      )
      SELECT updated_task.*,
             categories.name AS category_name,
             categories.color AS category_color
      FROM updated_task
      LEFT JOIN categories ON updated_task.category_id = categories.id
      `,
      [
        title ?? oldTask.title,
        completed ?? oldTask.completed,
        category_id ?? oldTask.category_id,
        priority ?? oldTask.priority,
        task_day_option ?? oldTask.task_day_option,
        task_custom_date ?? oldTask.task_custom_date,
        finalNotificationDate,
        finalNotificationTime,
        description ?? oldTask.description,
        id,
        req.user.userId,
      ],
    );

    res.json({
      ...result.rows[0],
      notification_date: formatDateOnly(result.rows[0].notification_date),
      task_custom_date: formatDateOnly(result.rows[0].task_custom_date),
    });
  } catch (err) {
    console.error("Update task error:", err.message);
    res.status(500).json({
      message: "Failed to update task",
      error: err.message,
    });
  }
});
app.delete("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("Delete task error:", err.message);
    res.status(500).json({ message: "Failed to delete task" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { name, birthdate, email, password } = req.body;

    if (!name || !birthdate || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, birthdate, email, password) VALUES ($1, $2, $3, $4)",
      [name, birthdate, email, hashedPassword],
    );

    res.status(201).json({ message: "User registered" });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: err.message });
  }
});
app.get("/reminders", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM reminders WHERE user_id = $1 ORDER BY id DESC",
      [req.user.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch reminders error:", err.message);
    res.status(500).json({ message: "Failed to fetch reminders" });
  }
});

app.post("/reminders", authMiddleware, async (req, res) => {
  try {
    const { title, deadline, description } = req.body;

    const result = await pool.query(
      "INSERT INTO reminders (title, deadline, description, accomplished, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [title, deadline || null, description || "", false, req.user.userId],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create reminder error:", err.message);
    res.status(500).json({ message: "Failed to create reminder" });
  }
});

app.put("/reminders/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { title, deadline, description, accomplished } = req.body;

    const result = await pool.query(
      "UPDATE reminders SET title = $1, deadline = $2, description = $3, accomplished = $4 WHERE id = $5 AND user_id = $6 RETURNING *",
      [
        title,
        deadline || null,
        description || "",
        accomplished,
        id,
        req.user.userId,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update reminder error:", err.message);
    res.status(500).json({ message: "Failed to update reminder" });
  }
});

app.delete("/reminders/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await pool.query(
      "DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Reminder not found" });
    }

    res.json({ message: "Reminder deleted" });
  } catch (err) {
    console.error("Delete reminder error:", err.message);
    res.status(500).json({ message: "Failed to delete reminder" });
  }
});
app.get("/trackers", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM trackers WHERE user_id = $1 ORDER BY id DESC",
      [req.user.userId],
    );

    res.json(
      result.rows.map((task) => ({
        ...task,
        notification_date: formatDateOnly(task.notification_date),
        task_custom_date: formatDateOnly(task.task_custom_date),
      })),
    );
  } catch (err) {
    console.error("Fetch trackers error:", err.message);
    res.status(500).json({ message: "Failed to fetch trackers" });
  }
});

app.post("/trackers", authMiddleware, async (req, res) => {
  try {
    const { title, total_seconds } = req.body;

    if (!title || !total_seconds) {
      return res.status(400).json({ message: "Title and timer are required" });
    }

    const result = await pool.query(
      "INSERT INTO trackers (title, total_seconds, remaining_seconds, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, total_seconds, total_seconds, req.user.userId],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create tracker error:", err.message);
    res.status(500).json({ message: "Failed to create tracker" });
  }
});
app.delete("/trackers/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await pool.query(
      "DELETE FROM trackers WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Tracker not found" });
    }

    res.json({ message: "Tracker deleted" });
  } catch (err) {
    console.error("Delete tracker error:", err.message);
    res.status(500).json({ message: "Failed to delete tracker" });
  }
});
app.put("/trackers/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const { title, remaining_seconds, done } = req.body;

    const existingTracker = await pool.query(
      "SELECT * FROM trackers WHERE id = $1 AND user_id = $2",
      [id, req.user.userId],
    );

    if (existingTracker.rows.length === 0) {
      return res.status(404).json({ message: "Tracker not found" });
    }

    const oldTracker = existingTracker.rows[0];

    const result = await pool.query(
      `UPDATE trackers
       SET title = $1,
           remaining_seconds = $2,
           done = $3
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [
        title ?? oldTracker.title,
        remaining_seconds ?? oldTracker.remaining_seconds,
        done ?? oldTracker.done,
        id,
        req.user.userId,
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update tracker error:", err.message);
    res.status(500).json({ message: "Failed to update tracker" });
  }
});
app.get("/categories", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM categories WHERE user_id = $1 ORDER BY id DESC",
      [req.user.userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Fetch categories error:", err.message);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

app.post("/categories", authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;

    const result = await pool.query(
      "INSERT INTO categories (name, color, user_id) VALUES ($1, $2, $3) RETURNING *",
      [name, color, req.user.userId],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Create category error:", err.message);
    res.status(500).json({ message: "Failed to create category" });
  }
});

app.delete("/categories/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await pool.query(
      "DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted" });
  } catch (err) {
    console.error("Delete category error:", err.message);
    res.status(500).json({ message: "Failed to delete category" });
  }
});

app.get("/profile", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, birthdate::text AS birthdate, password, profile_image FROM users WHERE id = $1",
      [req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Fetch profile error:", err.message);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});
app.put("/profile/name", authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (name.trim() === "") {
      return res.status(400).json({ message: "Name is required" });
    }

    const currentUser = await pool.query(
      "SELECT name FROM users WHERE id = $1",
      [req.user.userId],
    );

    if (currentUser.rows[0]?.name === name.trim()) {
      return res.status(400).json({ message: "There's nothing to change." });
    }

    const result = await pool.query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, birthdate::text AS birthdate, profile_image",
      [name.trim(), req.user.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update name error:", err.message);
    res.status(500).json({ message: "Failed to update name" });
  }
});

app.put("/profile/birthday", authMiddleware, async (req, res) => {
  try {
    const { birthdate } = req.body;

    if (!birthdate) {
      return res.status(400).json({ message: "Birthday is required" });
    }

    const result = await pool.query(
      "UPDATE users SET birthdate = $1 WHERE id = $2 RETURNING id, name, email, birthdate::text AS birthdate, profile_image",
      [birthdate, req.user.userId],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update birthday error:", err.message);
    res.status(500).json({ message: "Failed to update birthday" });
  }
});

app.put("/profile/email", authMiddleware, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    // get current user
    const currentUser = await pool.query(
      "SELECT id, email, password FROM users WHERE id = $1",
      [req.user.userId],
    );

    if (currentUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = currentUser.rows[0];

    // ❗ check if same email
    if (email.trim() === user.email) {
      return res.status(400).json({ message: "There's nothing to change." });
    }

    // ❗ CHECK PASSWORD (IMPORTANT)
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password." });
    }

    // ❗ check if email already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id <> $2",
      [email.trim(), req.user.userId],
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already exists." });
    }

    // ✅ only update AFTER ALL checks
    const result = await pool.query(
      "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, birthdate::text AS birthdate, profile_image",
      [email.trim(), req.user.userId],
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Update email error:", err.message);
    return res.status(500).json({ message: "Failed to update email" });
  }
});

app.put("/profile/password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Please enter all required fields.",
      });
    }

    const currentUser = await pool.query(
      "SELECT id, password FROM users WHERE id = $1",
      [req.user.userId],
    );

    if (currentUser.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = currentUser.rows[0];

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        message: "There's nothing to change.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [
      hashedPassword,
      req.user.userId,
    ]);

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Update password error:", err.message);
    res.status(500).json({ message: "Failed to update password" });
  }
});
app.post(
  "/profile/photo",
  authMiddleware,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No photo uploaded" });
      }

      const profileImage = `/uploads/profile/${req.file.filename}`;

      const result = await pool.query(
        "UPDATE users SET profile_image = $1 WHERE id = $2 RETURNING id, name, email, profile_image",
        [profileImage, req.user.userId],
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("Upload profile photo error:", err.message);
      res.status(500).json({ message: "Failed to upload profile photo" });
    }
  },
);
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const token = jwt.sign({ userId: user.id }, "secretkey", {
      expiresIn: "1d",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profile_image: user.profile_image,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Reads token from request header, verifies it, and attaches user info to request object
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, "secretkey");
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
