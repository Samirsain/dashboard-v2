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
  editAttendanceSchema,
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
// Re-applies the current policy to already-marked rows (fixes old statuses). Admin only.
router.post("/recompute", requireRole("Admin"), attendanceController.recompute);
// Directly edit check-in/check-out time and/or status for any date. Admin only.
router.patch("/edit", requireRole("Admin"), validate({ body: editAttendanceSchema }), attendanceController.editRecord);

export default router;
