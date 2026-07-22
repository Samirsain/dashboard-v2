import { Router } from "express";
import { imsController } from "../controllers/ims.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  createImsItemSchema,
  updateImsItemSchema,
  createImsTransactionSchema,
} from "../validation/ims.schema";

/**
 * IMS (Inventory Management System) — new, standalone feature. Every route is
 * Admin-only for now (both viewing and editing) since this is a fresh module
 * still being trialed; broaden later if other roles need access.
 */
const router = Router();

router.use(requireAuth);
router.use(requireRole("Admin"));

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
