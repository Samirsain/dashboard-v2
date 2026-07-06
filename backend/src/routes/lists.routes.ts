import { Router } from "express";
import { listsController } from "../controllers/lists.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import { createListSchema } from "../validation/list.schema";

const router = Router();

router.use(requireAuth);

// Everyone can read the available lists (needed to pick one when creating a
// task/checklist, and to filter). Creating/deleting lists is admin-only —
// this is the "Create List button lives on the dashboard, admin only" rule.
router.get("/", listsController.list);
router.post("/", requireRole("Admin"), validate({ body: createListSchema }), listsController.create);
router.delete("/:id", requireRole("Admin"), validate({ params: idParamSchema }), listsController.remove);

export default router;
