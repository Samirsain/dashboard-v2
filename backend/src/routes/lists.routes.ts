import { Router } from "express";
import { listsController } from "../controllers/lists.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { idParamSchema } from "../validation/user.schema";
import { createListSchema, updateListMembersSchema } from "../validation/list.schema";

const router = Router();

router.use(requireAuth);

// Reading lists is scoped per-user in the controller (a doer only sees lists
// they're a member of). Creating/deleting and managing access are admin-only.
router.get("/", listsController.list);
router.post("/", requireRole("Admin"), validate({ body: createListSchema }), listsController.create);
router.patch(
  "/:id/members",
  requireRole("Admin"),
  validate({ params: idParamSchema, body: updateListMembersSchema }),
  listsController.updateMembers
);
router.delete("/:id", requireRole("Admin"), validate({ params: idParamSchema }), listsController.remove);

export default router;
