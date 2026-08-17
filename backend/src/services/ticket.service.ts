import { getSupabase } from "../config/supabase";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../utils/AppError";

export type TicketStatus = "Pending" | "Waiting for Employee" | "Reopened" | "Completed";

export interface TicketData {
  employee_id: string;
  employee_name: string;
  /** Who the ticket is addressed to — always an MD or PC, never the raiser. */
  assigned_to_id: string;
  assigned_to_name: string;
  department?: string;
  title: string;
  description: string;
  solution_option1?: string;
  solution_option2?: string;
  blanket_required?: string;
  priority: string;
  attachment_url?: string;
}

export class TicketService {
  async createTicket(data: TicketData) {
    const ticketId = `TK-${uuidv4().substring(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();

    const insertData = {
      id: ticketId,
      ...data,
      status: "Pending",
      created_at: now,
      updated_at: now,
    };

    const supabase = getSupabase();
    const { error } = await supabase.from("tickets").insert(insertData);
    if (error) {
      throw new AppError(`Failed to create ticket: ${error.message}`);
    }
    return insertData;
  }

  async getAllTickets() {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) throw new AppError(error.message);
    return data;
  }

  /**
   * The tickets `userId` is party to: the ones they raised, plus the ones
   * addressed to them. Both halves matter now that tickets travel in every
   * direction — a PC needs to see what a doer sent them *and* what they
   * themselves sent the MD.
   */
  async getTicketsForUser(userId: string) {
    const supabase = getSupabase();
    // Two equality lookups rather than one `.or(...)`: PostgREST's or-filter
    // takes an interpolated string, so an id carrying a comma or bracket would
    // rewrite the filter. Both halves are indexed, and merging here is cheap.
    const [raised, addressed] = await Promise.all([
      supabase.from("tickets").select("*").eq("employee_id", userId),
      supabase.from("tickets").select("*").eq("assigned_to_id", userId),
    ]);
    if (raised.error) throw new AppError(raised.error.message);
    if (addressed.error) throw new AppError(addressed.error.message);

    // A ticket can't be both, but dedupe anyway so a bad row can't double up.
    const byId = new Map<string, any>();
    for (const t of [...(raised.data ?? []), ...(addressed.data ?? [])]) byId.set(t.id, t);
    return Array.from(byId.values()).sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
  }

  async getTicketById(id: string) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error) throw AppError.notFound("Ticket not found");
    return data;
  }

  async updateTicketStatus(id: string, status: TicketStatus) {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("tickets")
      .update({ status, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return data;
  }

  async provideSolution(id: string, solution: string, solutionType: string) {
    const supabase = getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("tickets")
      .update({
        solution,
        solution_type: solutionType,
        status: "Waiting for Employee",
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new AppError(error.message);
    return data;
  }

  /**
   * Counts over exactly the tickets `tickets` contains — the caller passes the
   * same set the user is allowed to list, so the headline numbers can never
   * advertise tickets that person cannot open.
   */
  getDashboardStats(tickets: any[]) {
    const today = new Date().toISOString().split("T")[0];
    const stats = {
      total: tickets.length,
      pending: 0,
      waiting: 0,
      reopened: 0,
      completedToday: 0,
    };

    for (const t of tickets) {
      if (t.status === "Pending") stats.pending++;
      else if (t.status === "Waiting for Employee") stats.waiting++;
      else if (t.status === "Reopened") stats.reopened++;
      else if (t.status === "Completed" && String(t.updated_at ?? "").startsWith(today!)) {
        stats.completedToday++;
      }
    }
    return stats;
  }
}

export const ticketService = new TicketService();
