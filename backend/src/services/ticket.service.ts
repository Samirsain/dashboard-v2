import { getSupabase } from "../config/supabase";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../utils/AppError";

export type TicketStatus = "Pending" | "Waiting for Employee" | "Reopened" | "Completed";

export interface TicketData {
  employee_id: string;
  employee_name: string;
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

  async getTicketsByUser(userId: string) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("employee_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) throw new AppError(error.message);
    return data;
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

  async getDashboardStats() {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("tickets").select("status");
    if (error) throw new AppError(error.message);

    const stats = {
      total: data.length,
      pending: 0,
      waiting: 0,
      reopened: 0,
      completedToday: 0,
    };

    const today = new Date().toISOString().split("T")[0];

    data.forEach((t: any) => {
      if (t.status === "Pending") stats.pending++;
      else if (t.status === "Waiting for Employee") stats.waiting++;
      else if (t.status === "Reopened") stats.reopened++;
      // We don't have completed_at, but we can check if it's completed and updated today
      // Wait, we need to fetch updated_at to check completed today. Let's fetch it.
    });

    // Let's do a better fetch for dashboard stats
    const { data: fullData, error: err2 } = await supabase.from("tickets").select("status, updated_at");
    if (err2) throw new AppError(err2.message);

    stats.completedToday = fullData.filter((t: any) => 
      t.status === "Completed" && t.updated_at?.startsWith(today)
    ).length;

    return stats;
  }
}

export const ticketService = new TicketService();
