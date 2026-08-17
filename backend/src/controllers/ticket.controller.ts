import { Request, Response, NextFunction } from "express";
import { ticketService } from "../services/ticket.service";
import { usersService } from "../services/users.service";
import { AppError } from "../utils/AppError";

/** Tickets are raised *with* management, so only these roles can receive one. */
const RECIPIENT_ROLES = ["MD", "PC"];

/**
 * Who may read or act on a ticket: the person who raised it, the person it was
 * addressed to, and the MD — who oversees everything regardless of routing.
 * A PC is deliberately not blanket-allowed: once tickets name a recipient,
 * letting any PC open a ticket addressed to the MD would make the routing
 * decorative.
 */
function canSeeTicket(ticket: { employee_id?: string; assigned_to_id?: string }, req: Request): boolean {
  const me = req.user!.sub;
  return req.user!.role === "MD" || ticket.employee_id === me || ticket.assigned_to_id === me;
}

export class TicketController {
  async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body;
      const me = req.user!.sub;

      const assignedToId = String(data.assigned_to_id ?? "").trim();
      if (!assignedToId) {
        throw AppError.badRequest("Choose who this ticket is for.");
      }
      if (assignedToId === me) {
        throw AppError.badRequest("You can't raise a ticket with yourself.");
      }
      const recipient = await usersService.getById(assignedToId).catch(() => null);
      if (!recipient) {
        throw AppError.badRequest("That person no longer exists.");
      }
      if (!RECIPIENT_ROLES.includes(recipient.role)) {
        throw AppError.badRequest("Tickets can only be raised with an MD or PC.");
      }

      const user = await usersService.getById(me);
      const ticket = await ticketService.createTicket({
        ...data,
        employee_id: me,
        employee_name: user.name,
        assigned_to_id: recipient.id,
        assigned_to_name: recipient.name,
      });
      res.status(201).json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async getTickets(req: Request, res: Response, next: NextFunction) {
    try {
      // The MD sees the whole board; everyone else sees what they raised and
      // what was addressed to them.
      const tickets =
        req.user!.role === "MD"
          ? await ticketService.getAllTickets()
          : await ticketService.getTicketsForUser(req.user!.sub);
      res.json(tickets);
    } catch (err) {
      next(err);
    }
  }

  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await ticketService.getTicketById(req.params.id as string);
      if (!canSeeTicket(ticket, req)) {
        throw AppError.forbidden("This ticket isn't yours to view.");
      }
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const existing = await ticketService.getTicketById(req.params.id as string);
      if (!canSeeTicket(existing, req)) {
        throw AppError.forbidden("This ticket isn't yours to change.");
      }
      const ticket = await ticketService.updateTicketStatus(req.params.id as string, status);
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async provideSolution(req: Request, res: Response, next: NextFunction) {
    try {
      const existing = await ticketService.getTicketById(req.params.id as string);
      // Answering is the recipient's job — that's what addressing it meant.
      // The MD can still step in when a PC is away.
      const isRecipient = existing.assigned_to_id === req.user!.sub;
      const isRaiser = existing.employee_id === req.user!.sub;
      if (isRaiser || (!isRecipient && req.user!.role !== "MD")) {
        throw AppError.forbidden("Only the person this ticket was raised with can answer it.");
      }
      const { solution, solutionType } = req.body;
      const ticket = await ticketService.provideSolution(
        req.params.id as string,
        solution,
        solutionType
      );
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user!.role !== "MD" && req.user!.role !== "PC") {
        throw AppError.forbidden("Only admins can view stats");
      }
      // Counted over the same set this user is allowed to list, so the numbers
      // never describe tickets they can't open.
      const tickets =
        req.user!.role === "MD"
          ? await ticketService.getAllTickets()
          : await ticketService.getTicketsForUser(req.user!.sub);
      res.json(ticketService.getDashboardStats(tickets ?? []));
    } catch (err) {
      next(err);
    }
  }
}

export const ticketController = new TicketController();
