import { Router } from "express";
import { tasksController } from "../controllers/tasks.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole, forbidAssistant } from "../middleware/role.middleware";
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
// Creating tasks is restricted to Admin; marking done, updating status,
// and revising stay open to every logged-in doer.
router.post(
  "/",
  requireRole("Admin"),
  validate({ body: createTaskSchema }),
  tasksController.create
);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateTaskSchema }),
  tasksController.update
);
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
