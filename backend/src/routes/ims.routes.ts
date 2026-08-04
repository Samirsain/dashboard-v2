import { Router } from "express";
import { imsController } from "../controllers/ims.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/role.middleware";
import { canAccessInventory } from "../utils/access";
import {
  createImsItemSchema,
  updateImsItemSchema,
  createImsTransactionSchema,
} from "../validation/ims.schema";

/**
 * IMS (Inventory Management System). MD always; PC only if granted
 * "Inventory" in PC Management (defaults on, since this used to be an
 * unconditional MD/PC feature).
 */
const router = Router();

router.use(requireAuth);
router.use(requirePermission(canAccessInventory));

// Item List
router.get("/items", imsController.listItems);
router.post("/items", validate({ body: createImsItemSchema }), imsController.createItem);
router.patch("/items/:skuCode", validate({ body: updateImsItemSchema }), imsController.updateItem);
router.delete("/items/:skuCode", imsController.removeItem);

// In / Out transaction log
router.get("/transactions", imsController.listTransactions);
router.post("/transactions", validate({ body: createImsTransactionSchema }), imsController.createTransaction);
router.delete("/transactions/:id", imsController.removeTransaction);

// Computed reports
router.get("/stock-ledger", imsController.stockLedger);
router.get("/reorder-sheet", imsController.reorderSheet);

export default router;
