import { Router } from "express";
import { ticketController } from "../controllers/ticket.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.post("/", ticketController.createTicket);
router.get("/", ticketController.getTickets);
router.get("/stats", ticketController.getDashboardStats);
router.get("/:id", ticketController.getTicketById);
router.patch("/:id/status", ticketController.updateStatus);
router.patch("/:id/solution", ticketController.provideSolution);

export default router;
