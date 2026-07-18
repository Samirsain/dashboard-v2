import { Router } from "express";
import { tasksController } from "../controllers/tasks.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole, requireTaskCreateAccess, forbidAssistant } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import {
  createTaskSchema,
  revisionSchema,
  taskFilterQuerySchema,
  updateTaskSchema,
} from "../validation/task.schema";

const router = Router();

router.use(requireAuth);

router.get("/", validate({ query: taskFilterQuerySchema }), tasksController.list);
router.get("/:id", validate({ params: idParamSchema }), tasksController.getById);
// Creating tasks is restricted to Admin (plus hardcoded full-task-access
// codes); marking done, updating status, and revising stay open to every
// logged-in doer.
router.post(
  "/",
  requireTaskCreateAccess,
  validate({ body: createTaskSchema }),
  tasksController.create
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateTaskSchema }),
  tasksController.update
);
// Must be registered before "/:id" so "completed" isn't swallowed as an id param.
// Irreversible — wipes every Completed task. Admin only (Team Performance reset).
router.delete("/completed", requireRole("Admin"), tasksController.removeCompleted);
router.delete(
  "/:id",
  requireRole("Admin"),
  forbidAssistant,
  validate({ params: idParamSchema }),
  tasksController.remove
);
router.post(
  "/:id/revision",
  validate({ params: idParamSchema, body: revisionSchema }),
  tasksController.revise
);
router.get(
  "/:id/revisions",
  validate({ params: idParamSchema }),
  tasksController.revisionHistory
);

export default router;
