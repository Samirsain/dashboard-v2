import { sheetsConfig } from "../config/sheets.config";
import { dataService, type SheetRecord } from "./data.service";
import { activityService } from "./activity.service";
import { usersService } from "./users.service";
import { generateId, generateUuid } from "../utils/id";
import { addTAT, deadlineAt, delayMinutes } from "../utils/tatEngine";
import { AppError } from "../utils/AppError";
import type {
  WorkflowFieldType,
  WorkflowFieldValue,
  WorkflowTemplateField,
  WorkflowInstance,
  WorkflowInstanceStatus,
  WorkflowStep,
  WorkflowStepEvent,
  WorkflowStepStatus,
  WorkflowTemplate,
} from "../types";

const templatesEntity = sheetsConfig.workflowTemplates;
const stepsEntity = sheetsConfig.workflowSteps;
const fieldsEntity = sheetsConfig.workflowTemplateFields;
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

function toField(r: SheetRecord): WorkflowTemplateField {
  const type = (r["Type"] ?? "text") as WorkflowFieldType;
  return {
    id: r["Field ID"] ?? "",
    templateId: r["Template ID"] ?? "",
    fieldNo: Number(r["Field No"] || 0),
    label: r["Label"] ?? "",
    type: type === "number" || type === "date" ? type : "text",
  };
}

/**
 * Field values are stored as a JSON array of {label, value}. Anything
 * unreadable (hand-edited cell, older run from before fields existed) reads
 * back as no fields rather than breaking the whole run.
 */
function parseFieldValues(raw: string): WorkflowFieldValue[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.label === "string")
      .map((v) => ({ label: String(v.label), value: String(v.value ?? "") }));
  } catch {
    return [];
  }
}

function toInstance(r: SheetRecord): WorkflowInstance {
  return {
    id: r["Instance ID"] ?? "",
    templateId: r["Template ID"] ?? "",
    title: r["Title"] ?? "",
    details: r["Details"] ?? "",
    fieldValues: parseFieldValues(r["Field Values"] ?? ""),
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

/**
 * A step belongs to exactly one person, and only that person acts on it —
 * otherwise anyone signed in could mark a colleague's work done (or bounce it
 * back) straight through the API, and the Planned/Actual record would be a
 * lie. Whoever manages workflows can still step in when someone is away.
 */
function assertOwnStep(
  step: WorkflowStepEvent,
  actorId: string,
  canManageAnyStep: boolean,
  action: string
): void {
  if (canManageAnyStep || step.doerId === actorId) return;
  throw AppError.forbidden(`Only the doer this step is assigned to can ${action} it.`);
}

/** Matches an event's TAT when a manual date was picked for a Whenever-Needed step. */
const MANUAL_DEADLINE_RE = /^WHENEVER_NEEDED:(\d{4}-\d{2}-\d{2})$/i;

/**
 * Resolves a step event's deadline: a manually-picked date (stored as
 * "WHENEVER_NEEDED:2026-08-15") wins outright; otherwise it's the normal
 * TAT-from-`from` calculation, which returns null for a plain
 * "WHENEVER_NEEDED" that was left with no date.
 */
function resolveDeadline(tat: string, from: Date): Date | null {
  const manual = tat.match(MANUAL_DEADLINE_RE);
  return manual ? deadlineAt(manual[1]!) : addTAT(from, tat);
}

async function getStepsForTemplate(templateId: string): Promise<WorkflowStep[]> {
  const records = await dataService.findAll(stepsEntity);
  return records
    .map(toStep)
    .filter((s) => s.templateId === templateId)
    .sort((a, b) => a.stepNo - b.stepNo);
}

async function getFieldsForTemplate(templateId: string): Promise<WorkflowTemplateField[]> {
  const records = await dataService.findAll(fieldsEntity);
  return records
    .map(toField)
    .filter((f) => f.templateId === templateId)
    .sort((a, b) => a.fieldNo - b.fieldNo);
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

  async listTemplates(): Promise<
    Array<WorkflowTemplate & { steps: WorkflowStep[]; fields: WorkflowTemplateField[] }>
  > {
    const [templateRecords, stepRecords, fieldRecords] = await Promise.all([
      dataService.findAll(templatesEntity),
      dataService.findAll(stepsEntity),
      dataService.findAll(fieldsEntity),
    ]);
    const steps = stepRecords.map(toStep);
    const fields = fieldRecords.map(toField);
    return templateRecords
      .map(toTemplate)
      .map((t) => ({
        ...t,
        steps: steps.filter((s) => s.templateId === t.id).sort((a, b) => a.stepNo - b.stepNo),
        fields: fields.filter((f) => f.templateId === t.id).sort((a, b) => a.fieldNo - b.fieldNo),
      }));
  },

  async getTemplate(
    id: string
  ): Promise<WorkflowTemplate & { steps: WorkflowStep[]; fields: WorkflowTemplateField[] }> {
    const record = await dataService.findById(templatesEntity, id);
    if (!record) throw AppError.notFound(`Workflow template "${id}" not found`);
    const [steps, fields] = await Promise.all([
      getStepsForTemplate(id),
      getFieldsForTemplate(id),
    ]);
    return { ...toTemplate(record), steps, fields };
  },

  async createTemplate(input: {
    name: string;
    fields?: Array<{ label: string; type: WorkflowFieldType }>;
    steps: Array<{ what: string; doerId: string; how: string; tat: string }>;
  }): Promise<WorkflowTemplate & { steps: WorkflowStep[]; fields: WorkflowTemplateField[] }> {
    if (input.steps.length === 0) {
      throw AppError.badRequest("A workflow template needs at least one step");
    }

    const templateId = generateId("WFT");
    const createdAt = new Date().toISOString();
    await dataService.append(templatesEntity, {
      "Template ID": templateId,
      Name: input.name,
      CreatedAt: createdAt,
    });

    const fields: WorkflowTemplateField[] = [];
    for (let i = 0; i < (input.fields ?? []).length; i++) {
      const f = input.fields![i]!;
      const saved = await dataService.append(fieldsEntity, {
        "Field ID": generateId("WFF"),
        "Template ID": templateId,
        "Field No": String(i + 1),
        Label: f.label,
        Type: f.type,
      });
      fields.push(toField(saved));
    }

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

    return { id: templateId, name: input.name, createdAt, steps, fields };
  },

  async removeTemplate(id: string): Promise<void> {
    const [steps, fields] = await Promise.all([
      getStepsForTemplate(id),
      getFieldsForTemplate(id),
    ]);
    for (const step of steps) {
      await dataService.deleteById(stepsEntity, step.id);
    }
    for (const field of fields) {
      await dataService.deleteById(fieldsEntity, field.id);
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

  /**
   * Every step of an in-flight run that belongs to `doerId` — what that person
   * actually needs to see. Used by the Doer's Workflow view, which shows only
   * their own steps rather than the whole template/run machinery.
   *
   * `isMyTurn` is the only thing that decides whether they can act: a step is
   * theirs to do when it's Active (or already Overdue). Pending steps are
   * returned too so they can see what's coming, but not acted on.
   */
  async listStepsForDoer(doerId: string): Promise<
    Array<{
      instanceId: string;
      instanceTitle: string;
      instanceDetails: string;
      /** The run's data (PO Number, Vendor, ...) so the doer knows what this is about. */
      fieldValues: WorkflowFieldValue[];
      totalSteps: number;
      isMyTurn: boolean;
      /** Resolved name for the step's WHO, so the doer view needs no user lookup. */
      doerName: string;
      step: WorkflowStepEvent;
    }>
  > {
    const [instanceRecords, eventRecords, doer] = await Promise.all([
      dataService.findAll(instancesEntity),
      dataService.findAll(eventsEntity),
      usersService.getById(doerId).catch(() => null),
    ]);

    const activeInstances = instanceRecords.map(toInstance).filter((i) => i.status === "Active");
    const instanceById = new Map(activeInstances.map((i) => [i.id, i]));

    const events = eventRecords.map(toEvent);
    const stepCountByInstance = new Map<string, number>();
    for (const e of events) {
      stepCountByInstance.set(e.instanceId, (stepCountByInstance.get(e.instanceId) ?? 0) + 1);
    }

    return events
      .filter((e) => e.doerId === doerId && instanceById.has(e.instanceId))
      .map(withDerivedStatus)
      // A finished step is history, not work — leave it out of their list.
      .filter((e) => e.status !== "Complete")
      .map((step) => {
        const instance = instanceById.get(step.instanceId)!;
        return {
          instanceId: instance.id,
          instanceTitle: instance.title,
          instanceDetails: instance.details,
          fieldValues: instance.fieldValues,
          totalSteps: stepCountByInstance.get(step.instanceId) ?? 0,
          isMyTurn: step.status === "Active" || step.status === "Overdue",
          doerName: doer?.name ?? "",
          step,
        };
      })
      .sort((a, b) => {
        // Actionable work first, then whatever is due soonest.
        if (a.isMyTurn !== b.isMyTurn) return a.isMyTurn ? -1 : 1;
        return (a.step.planned || "9999").localeCompare(b.step.planned || "9999");
      });
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
    /** Optional — when the template defines fields, the first one names the run. */
    title?: string;
    details?: string;
    /** Values for the template's fields, in the template's own field order. */
    fieldValues?: string[];
    /**
     * For any step whose TAT is "Whenever Needed" — a target date (YYYY-MM-DD)
     * to do it by, keyed by step number. Optional per step; a step left out
     * simply has no deadline, as before.
     */
    stepDeadlines?: Record<string, string>;
    requestedBy: string;
  }): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    const [templateSteps, templateFields] = await Promise.all([
      getStepsForTemplate(input.templateId),
      getFieldsForTemplate(input.templateId),
    ]);
    if (templateSteps.length === 0) {
      throw AppError.badRequest(`Workflow template "${input.templateId}" has no steps`);
    }

    // Pair each submitted value with its field's label, so the run carries a
    // self-describing record rather than a bare positional array.
    const fieldValues: WorkflowFieldValue[] = templateFields.map((f, i) => ({
      label: f.label,
      value: (input.fieldValues?.[i] ?? "").trim(),
    }));

    // The first field names the run ("PO-1042"), which is why there's no
    // separate title to type. Templates with no fields still take one.
    const title = (fieldValues[0]?.value || input.title || "").trim();
    if (!title) {
      throw AppError.badRequest(
        templateFields.length > 0
          ? `"${templateFields[0]!.label}" is required — it names this run.`
          : "A title is required to start a run."
      );
    }

    const instanceId = generateUuid();
    const startedAt = new Date();

    await dataService.append(instancesEntity, {
      "Instance ID": instanceId,
      "Template ID": input.templateId,
      Title: title,
      Details: input.details ?? "",
      "Field Values": JSON.stringify(fieldValues),
      StartedAt: startedAt.toISOString(),
      Status: "Active",
      RequestedBy: input.requestedBy,
    });

    const events: WorkflowStepEvent[] = [];
    for (const step of templateSteps) {
      const isFirst = step.stepNo === 1;
      // A picked date for a Whenever-Needed step rides along on the event's
      // own TAT (not the template's), so it survives to whenever this step
      // actually activates — which for step 2+ is well after this loop.
      const manualDate =
        step.tat.trim().toUpperCase() === "WHENEVER_NEEDED"
          ? input.stepDeadlines?.[String(step.stepNo)]?.trim()
          : undefined;
      const eventTat = manualDate ? `WHENEVER_NEEDED:${manualDate}` : step.tat;
      const planned = isFirst ? resolveDeadline(eventTat, startedAt) : null;
      const saved = await dataService.append(eventsEntity, {
        "Event ID": generateUuid(),
        "Instance ID": instanceId,
        "Step No": String(step.stepNo),
        What: step.what,
        "Doer ID": step.doerId,
        How: step.how,
        TAT: eventTat,
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
      task: title,
      detail: `Step 1 (${templateSteps[0]!.what}) is now active`,
    });

    const instance: WorkflowInstance = {
      id: instanceId,
      templateId: input.templateId,
      title,
      details: input.details ?? "",
      fieldValues,
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
    actorId: string,
    canManageAnyStep = false
  ): Promise<{ instance: WorkflowInstance; steps: WorkflowStepEvent[] }> {
    const events = await getEventsForInstance(instanceId);
    const current = events.find((e) => e.stepNo === stepNo);
    if (!current) throw AppError.notFound(`Step ${stepNo} not found on this instance`);
    if (current.status !== "Active" && current.status !== "Overdue") {
      throw AppError.badRequest(`Step ${stepNo} is not active — cannot complete it`);
    }
    assertOwnStep(current, actorId, canManageAnyStep, "complete");

    const now = new Date();
    await dataService.updateById(eventsEntity, current.id, {
      Actual: now.toISOString(),
      Status: "Complete",
    });

    const next = events.find((e) => e.stepNo === stepNo + 1);
    if (next) {
      const planned = resolveDeadline(next.tat, now);
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
    actorId: string,
    canManageAnyStep = false
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
    assertOwnStep(current, actorId, canManageAnyStep, "send back");

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
