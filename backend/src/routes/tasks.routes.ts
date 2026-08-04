import { Router } from "express";
import { tasksController } from "../controllers/tasks.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireTaskCreateAccess, requirePermission, forbidAssistant } from "../middleware/role.middleware";
import { canDeleteTask, canViewTeamPerformance } from "../utils/access";
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
// Irreversible — wipes every Completed task. Team Performance reset, so gated
// the same way as that scoreboard: MD always, PC only if granted.
router.delete(
  "/completed",
  requirePermission(canViewTeamPerformance),
  tasksController.removeCompleted
);
router.delete(
  "/:id",
  requirePermission(canDeleteTask, "Only MD/PC with Delete Task access can delete a task."),
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
// Bulk hand-off for someone on leave — moves every open task and active
// checklist template from one doer to another. Same authority as reassigning
// a single task (MD/PC), since that's exactly what this does at scale.
router.post("/reassign-all-work", requireTaskCreateAccess, tasksController.reassignAllWork);

export default router;
