import { Router } from "express";
import { attendanceController } from "../controllers/attendance.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import {
  attendanceDateQuerySchema,
  attendanceRangeQuerySchema,
  markStatusSchema,
  checkInOutSchema,
  remarksSchema,
} from "../validation/attendance.schema";

const router = Router();

router.use(requireAuth);

// Everyone can view; only Admin/Attendance Manager can mark (enforced inside
// the controller via canMarkAttendance — role alone isn't enough since a
// plain Doer can be flagged as the Attendance Manager).
router.get("/today", attendanceController.today);
router.get("/history", validate({ query: attendanceDateQuerySchema }), attendanceController.history);
router.get("/day", validate({ query: attendanceDateQuerySchema }), attendanceController.day);
router.get("/range", validate({ query: attendanceRangeQuerySchema }), attendanceController.range);
router.post("/mark", validate({ body: markStatusSchema }), attendanceController.markStatus);
router.post("/check-in", validate({ body: checkInOutSchema }), attendanceController.checkIn);
router.post("/check-out", validate({ body: checkInOutSchema }), attendanceController.checkOut);
router.patch("/remarks", validate({ body: remarksSchema }), attendanceController.setRemarks);
// Irreversible — wipes every attendance record for every employee/date. Admin only.
router.delete("/all", requireRole("Admin"), attendanceController.clearAll);

export default router;
