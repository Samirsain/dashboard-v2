import { Router } from "express";
import { listsController } from "../controllers/lists.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canManageDoers } from "../utils/access";
import { idParamSchema } from "../validation/user.schema";
import { createListSchema, updateListMembersSchema } from "../validation/list.schema";

const router = Router();

router.use(requireAuth);

// Reading lists is scoped per-user in the controller (a doer only sees lists
// they're a member of). Creating/deleting and managing access are part of
// Doer Management — MD always, a PC only if granted it in PC Management.
router.get("/", listsController.list);
router.post("/", requirePermission(canManageDoers), validate({ body: createListSchema }), listsController.create);
router.patch(
  "/:id/members",
  requirePermission(canManageDoers),
  validate({ params: idParamSchema, body: updateListMembersSchema }),
  listsController.updateMembers
);
router.delete(
  "/:id",
  requirePermission(canManageDoers),
  validate({ params: idParamSchema }),
  listsController.remove
);

export default router;
