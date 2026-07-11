import { Request, Response, NextFunction } from "express";
import { ticketService } from "../services/ticket.service";
import { usersService } from "../services/users.service";

export class TicketController {
  async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const data = req.body;
      const user = await usersService.getById(req.user!.sub);
      data.employee_id = req.user!.sub;
      data.employee_name = user.name;
      const ticket = await ticketService.createTicket(data);
      res.status(201).json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async getTickets(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user!.role === "Admin") {
        const tickets = await ticketService.getAllTickets();
        res.json(tickets);
      } else {
        const tickets = await ticketService.getTicketsByUser(req.user!.sub);
        res.json(tickets);
      }
    } catch (err) {
      next(err);
    }
  }

  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await ticketService.getTicketById(req.params.id as string);
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      const ticket = await ticketService.updateTicketStatus(req.params.id as string, status);
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async provideSolution(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user!.role !== "Admin") {
        return res.status(403).json({ error: "Only admins can provide solutions" });
      }
      const { solution, solutionType } = req.body;
      const ticket = await ticketService.provideSolution(req.params.id as string, solution, solutionType);
      res.json(ticket);
    } catch (err) {
      next(err);
    }
  }

  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user!.role !== "Admin") {
        return res.status(403).json({ error: "Only admins can view stats" });
      }
      const stats = await ticketService.getDashboardStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
}

export const ticketController = new TicketController();
