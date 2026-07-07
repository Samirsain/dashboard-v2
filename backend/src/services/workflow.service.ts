import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { activityService } from "./activity.service";
import { generateId, generateUuid } from "../utils/id";
import { addTAT, delayMinutes } from "../utils/tatEngine";
import { AppError } from "../utils/AppError";
import type {
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStep,
  WorkflowStepEvent,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "../types";

const templatesEntity = sheetsConfig.workflowTemplates;
const stepsEntity = sheetsConfig.workflowSteps;
const instancesEntity = sheetsConfig.workflowInstances;
const eventsEntity = sheetsConfig.workflowStepEvents;

/** A step is rejected back to the previous step this many times before escalating instead of looping again. */
const MAX_REWORK = 3;

function toTemplate(r: SheetRecord): WorkflowTemplate {
  return { id: r["Template ID"] ?? "", name: r["Name"] ?? "", createdAt: r["CreatedAt"] ?? "" };
}

function toStep(r: SheetRecord): WorkflowStep {
  return {
    id: r["Step ID"] ?? "",
    templateId: r["Template ID"] ?? "",
    stepNo: Number(r["Step No"] || 0),
    what: r["What"] ?? "",
    doerId: r["Doer ID"] ?? "",
    how: r["How"] ?? "",
    tat: r["TAT"] ?? "",
  };
}

function toInstance(r: SheetRecord): WorkflowInstance {
  return {
    id: r["Instance ID"] ?? "",
    templateId: r["Template ID"] ?? "",
    title: r["Title"] ?? "",
    startedAt: r["StartedAt"] ?? "",
    status: (r["Status"] as WorkflowInstanceStatus) || "Active",
    requestedBy: r["RequestedBy"] ?? "",
  };
}

function toEvent(r: SheetRecord): WorkflowStepEvent {
  return {
    id: r["Event ID"] ?? "",
    instanceId: r["Instance ID"] ?? "",
    stepNo: Number(r["Step No"] || 0),
    what: r["What"] ?? "",
    doerId: r["Doer ID"] ?? "",
    how: r["How"] ?? "",
    tat: r["TAT"] ?? "",
    planned: r["Planned"] ?? "",
    actual: r["Actual"] ?? "",
    status: (r["Status"] as WorkflowStepStatus) || "Pending",
    reworkCount: Number(r["Rework Count"] || 0),
  };
}

/**
 * A step event is only ever persisted as Pending/Active/Complete/Blocked —
 * "Overdue" is derived at read time from Planned vs now, never stored, so it
 * can never drift stale (mirrors how dashboard.service computes task overdue).
 */
function withDerivedStatus(event: WorkflowStepEvent): WorkflowStepEvent {
  if (event.status === "Active" && event.planned) {
    const plannedDate = new Date(event.planned);
    if (!Number.isNaN(plannedDate.getTime()) && plannedDate.getTime() < Date.now()) {
      return { ...event, status: "Overdue" };
    }
  }
  return event;
}

async function getStepsForTemplate(templateId: string): Promise<WorkflowStep[]> {
  const records = await dataService.findAll(stepsEntity);
  return records
    .map(toStep)
    .filter((s) => s.templateId === templateId)
    .sort((a, b) => a.stepNo - b.stepNo);
}

async function getEventsForInstance(instanceId: string): Promise<WorkflowStepEvent[]> {
  const records = await dataService.findAll(eventsEntity);
  return records
    .map(toEvent)
    .filter((e) => e.instanceId === instanceId)
    .sort((a, b) => a.stepNo - b.stepNo)
    .map(withDerivedStatus);
}

export const workflowService = {
  // ---- Templates ---------------------------------------------------------

  async listTemplates(): Promise<Array<WorkflowTemplate & { steps: WorkflowStep[] }>> {
    const [templateRecords, stepRecords] = await Promise.all([
      dataService.findAll(templatesEntity),
      dataService.findAll(stepsEntity),
    ]);
    const steps = stepRecords.map(toStep);
    return templateRecords
      .map(toTemplate)
      .map((t) => ({
        ...t,
        steps: steps.filter((s) => s.templateId === t.id).sort((a, b) => a.stepNo - b.stepNo),
      }));
  },

  async getTemplate(id: string): Promise<WorkflowTemplate & { steps: WorkflowStep[] }> {
    const record = await dataService.findById(templatesEntity, id);
    if (!record) throw AppError.notFound(`Workflow template "${id}" not found`);
    const steps = await getStepsForTemplate(id);
    return { ...toTemplate(record), steps };
  },

  async createTemplate(input: {
    name: string;
    steps: Array<{ what: string; doerId: string; how: string; tat: string }>;
  }): Promise<WorkflowTemplate & { steps: WorkflowStep[] }> {
    if (input.steps.length === 0) {
      throw AppError.badRequest("A workflow template needs at least one step");
    }

    const templateId = generateId("WFT");
    await dataService.append(templatesEntity, {
      "Template ID": templateId,
      Name: input.name,
      CreatedAt: new Date().toISOString(),
    });

    const steps: WorkflowStep[] = [];
    for (let i = 0; i < input.steps.length; i++) {
      const s = input.steps[i]!;
      const stepNo = i + 1;
      const saved = await dataService.append(stepsEntity, {
        "Step ID": generateId("WFS"),
        "Template ID": templateId,
        "Step No": String(stepNo),
        What: s.what,
        "Doer ID": s.doerId,
        How: s.how,
        TAT: s.tat,
      });
      steps.push(toStep(saved));
    }

    return { id: templateId, name: input.name, createdAt: new Date().toISOString(), steps };
  },

  async removeTemplate(id: string): Promise<void> {
    const steps = await getStepsForTemplate(id);
    for (const step of steps) {
      await dataService.deleteById(stepsEntity, step.id);
    }
    await dataService.deleteById(templatesEntity, id);
  },

  // ---- Instances -----------------------------------------------------------

  async listInstances(filter?: { status?: WorkflowInstanceStatus }): Promise<WorkflowInstance[]> {
    const records = await dataService.findAll(instancesEntity);
    let instances = records.map(toInstance);
    if (filter?.status) instances = instances.filter((i) => i.status === filter.status);
    return instances.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  async getInstanceDetail(
    id: string
  ): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    const record = await dataService.findById(instancesEntity, id);
    if (!record) throw AppError.notFound(`Workflow instance "${id}" not found`);
    const steps = await getEventsForInstance(id);
    return { instance: toInstance(record), steps };
  },

  async startInstance(input: {
    templateId: string;
    title: string;
    requestedBy: string;
  }): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    const templateSteps = await getStepsForTemplate(input.templateId);
    if (templateSteps.length === 0) {
      throw AppError.badRequest(`Workflow template "${input.templateId}" has no steps`);
    }

    const instanceId = generateUuid();
    const startedAt = new Date();

    await dataService.append(instancesEntity, {
      "Instance ID": instanceId,
      "Template ID": input.templateId,
      Title: input.title,
      StartedAt: startedAt.toISOString(),
      Status: "Active",
      RequestedBy: input.requestedBy,
    });

    const events: WorkflowStepEvent[] = [];
    for (const step of templateSteps) {
      const isFirst = step.stepNo === 1;
      const planned = isFirst ? addTAT(startedAt, step.tat) : null;
      const saved = await dataService.append(eventsEntity, {
        "Event ID": generateUuid(),
        "Instance ID": instanceId,
        "Step No": String(step.stepNo),
        What: step.what,
        "Doer ID": step.doerId,
        How: step.how,
        TAT: step.tat,
        Planned: planned ? planned.toISOString() : "",
        Actual: "",
        Status: isFirst ? "Active" : "Pending",
        "Rework Count": "0",
      });
      events.push(toEvent(saved));
    }

    await activityService.log({
      user: input.requestedBy,
      action: "Started workflow",
      task: input.title,
      detail: `Step 1 (${templateSteps[0]!.what}) is now active`,
    });

    const instance: WorkflowInstance = {
      id: instanceId,
      templateId: input.templateId,
      title: input.title,
      startedAt: startedAt.toISOString(),
      status: "Active",
      requestedBy: input.requestedBy,
    };
    return { instance, steps: events };
  },

  /** Assignee marks their step done: stamps Actual, cascades Planned to the next step, activates it. */
  async completeStep(
    instanceId: string,
    stepNo: number,
    actorId: string
  ): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    const events = await getEventsForInstance(instanceId);
    const current = events.find((e) => e.stepNo === stepNo);
    if (!current) throw AppError.notFound(`Step ${stepNo} not found on this instance`);
    if (current.status !== "Active" && current.status !== "Overdue") {
      throw AppError.badRequest(`Step ${stepNo} is not active — cannot complete it`);
    }

    const now = new Date();
    await dataService.updateById(eventsEntity, current.id, {
      Actual: now.toISOString(),
      Status: "Complete",
    });

    const next = events.find((e) => e.stepNo === stepNo + 1);
    if (next) {
      const planned = addTAT(now, next.tat);
      await dataService.updateById(eventsEntity, next.id, {
        Planned: planned ? planned.toISOString() : "",
        Status: "Active",
      });
      await activityService.log({
        user: actorId,
        action: "Completed workflow step",
        task: current.what,
        detail: `Step ${stepNo + 1} (${next.what}) is now active`,
      });
    } else {
      await dataService.updateById(instancesEntity, instanceId, { Status: "Complete" });
      await activityService.log({
        user: actorId,
        action: "Completed workflow step",
        task: current.what,
        detail: "Final step done — workflow instance complete",
      });
    }

    return this.getInstanceDetail(instanceId);
  },

  /**
   * Assignee rejects their step: halts the chain, reopens the previous step
   * for rework. Exceeding MAX_REWORK stops the auto-reopen and escalates
   * instead (PRD §9 rework safeguards).
   */
  async rejectStep(
    instanceId: string,
    stepNo: number,
    actorId: string
  ): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    if (stepNo <= 1) {
      throw AppError.badRequest("The first step has no previous step to send rework back to");
    }
    const events = await getEventsForInstance(instanceId);
    const current = events.find((e) => e.stepNo === stepNo);
    const previous = events.find((e) => e.stepNo === stepNo - 1);
    if (!current || !previous) throw AppError.notFound(`Step ${stepNo} not found on this instance`);
    if (current.status !== "Active" && current.status !== "Overdue") {
      throw AppError.badRequest(`Step ${stepNo} is not active — cannot reject it`);
    }

    const newReworkCount = current.reworkCount + 1;
    await dataService.updateById(eventsEntity, current.id, {
      Status: "Blocked",
      "Rework Count": String(newReworkCount),
    });

    if (newReworkCount > MAX_REWORK) {
      await activityService.log({
        user: actorId,
        action: "Workflow step rejected",
        task: current.what,
        detail: `Step ${stepNo} exceeded ${MAX_REWORK} reworks — escalated, not auto-reopened`,
      });
    } else {
      await dataService.updateById(eventsEntity, previous.id, {
        Status: "Active",
        Actual: "",
      });
      await activityService.log({
        user: actorId,
        action: "Workflow step rejected",
        task: current.what,
        detail: `Step ${stepNo} rejected — step ${stepNo - 1} (${previous.what}) reopened for rework`,
      });
    }

    return this.getInstanceDetail(instanceId);
  },
};

export function computeDelayMinutes(event: WorkflowStepEvent): number | null {
  const planned = event.planned ? new Date(event.planned) : null;
  const actual = event.actual ? new Date(event.actual) : null;
  return delayMinutes(planned, actual);
}
