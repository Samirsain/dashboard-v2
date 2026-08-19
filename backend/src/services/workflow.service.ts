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

/**
 * How many individual runs the overview carries per (workflow, step, person)
 * group. The group's `total` is always exact; this only bounds how many get
 * listed, so one workflow with a thousand backed-up runs can't blow up the
 * response.
 */
const BUCKET_SAMPLE_SIZE = 10;

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
    rejectReason: r["Reject Reason"] ?? "",
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
  const records = await dataService.findWhere(stepsEntity, "Template ID", templateId);
  return records.map(toStep).sort((a, b) => a.stepNo - b.stepNo);
}

async function getFieldsForTemplate(templateId: string): Promise<WorkflowTemplateField[]> {
  const records = await dataService.findWhere(fieldsEntity, "Template ID", templateId);
  return records.map(toField).sort((a, b) => a.fieldNo - b.fieldNo);
}

async function getEventsForInstance(instanceId: string): Promise<WorkflowStepEvent[]> {
  const records = await dataService.findWhere(eventsEntity, "Instance ID", instanceId);
  return records
    .map(toEvent)
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

  /**
   * Replaces a template's name, fields and step chain wholesale. Safe to do
   * even while runs are in flight: a run's steps are copied into its own
   * events the moment it starts (see startInstance), so editing the template
   * afterward only shapes runs started *after* the edit — nothing already
   * running or finished silently changes underneath it.
   */
  async updateTemplate(
    id: string,
    input: {
      name: string;
      fields?: Array<{ label: string; type: WorkflowFieldType }>;
      steps: Array<{ what: string; doerId: string; how: string; tat: string }>;
    }
  ): Promise<WorkflowTemplate & { steps: WorkflowStep[]; fields: WorkflowTemplateField[] }> {
    if (input.steps.length === 0) {
      throw AppError.badRequest("A workflow template needs at least one step");
    }
    const existing = await dataService.findById(templatesEntity, id);
    if (!existing) throw AppError.notFound(`Workflow template "${id}" not found`);

    await dataService.updateById(templatesEntity, id, { Name: input.name });

    const [oldSteps, oldFields] = await Promise.all([
      getStepsForTemplate(id),
      getFieldsForTemplate(id),
    ]);
    for (const step of oldSteps) {
      await dataService.deleteById(stepsEntity, step.id);
    }
    for (const field of oldFields) {
      await dataService.deleteById(fieldsEntity, field.id);
    }

    const fields: WorkflowTemplateField[] = [];
    for (let i = 0; i < (input.fields ?? []).length; i++) {
      const f = input.fields![i]!;
      const saved = await dataService.append(fieldsEntity, {
        "Field ID": generateId("WFF"),
        "Template ID": id,
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
        "Template ID": id,
        "Step No": String(stepNo),
        What: s.what,
        "Doer ID": s.doerId,
        How: s.how,
        TAT: s.tat,
      });
      steps.push(toStep(saved));
    }

    return { ...toTemplate(existing), name: input.name, steps, fields };
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
    const records = filter?.status
      ? await dataService.findWhere(instancesEntity, "Status", filter.status)
      : await dataService.findAll(instancesEntity);
    return records.map(toInstance).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  /**
   * Permanently removes a run and its step events — Active or Complete,
   * either can be deleted (e.g. a run started by mistake, or old records
   * being cleared out). This does not touch the template it came from.
   */
  async removeInstance(id: string): Promise<void> {
    const record = await dataService.findById(instancesEntity, id);
    if (!record) throw AppError.notFound(`Workflow instance "${id}" not found`);
    const events = await getEventsForInstance(id);
    for (const event of events) {
      await dataService.deleteById(eventsEntity, event.id);
    }
    await dataService.deleteById(instancesEntity, id);
  },

  /**
   * Everything needed to lay a template's runs out spreadsheet-style — one
   * What/Who/How/When header block per step, one row per run underneath,
   * each run's own field values plus every step's Planned/Actual/Status/Delay
   * in order. Mirrors the shape of the tracking sheet this replaced.
   */
  async exportTemplateData(templateId: string): Promise<{
    templateName: string;
    fieldLabels: string[];
    steps: Array<{ stepNo: number; what: string; doerName: string; how: string; tat: string }>;
    runs: Array<{
      id: string;
      title: string;
      status: WorkflowInstanceStatus;
      startedAt: string;
      fieldValues: string[];
      steps: Array<{
        stepNo: number;
        planned: string;
        actual: string;
        status: WorkflowStepStatus | "Pending";
        delayMinutes: number | null;
      }>;
    }>;
  }> {
    const templateRecord = await dataService.findById(templatesEntity, templateId);
    if (!templateRecord) throw AppError.notFound(`Workflow template "${templateId}" not found`);

    const [templateSteps, templateFields, instanceRecords, users] = await Promise.all([
      getStepsForTemplate(templateId),
      getFieldsForTemplate(templateId),
      dataService.findWhere(instancesEntity, "Template ID", templateId),
      usersService.list(),
    ]);

    const doerNameById = new Map(users.map((u) => [u.id, u.name]));
    const instances = instanceRecords
      .map(toInstance)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    // Only this template's runs, so the events read stays proportional to what
    // is being shown rather than to every step event ever recorded.
    const eventRecords = await dataService.findWhereIn(
      eventsEntity,
      "Instance ID",
      instances.map((i) => i.id)
    );

    const eventsByInstance = new Map<string, WorkflowStepEvent[]>();
    for (const raw of eventRecords) {
      const e = withDerivedStatus(toEvent(raw));
      if (!eventsByInstance.has(e.instanceId)) eventsByInstance.set(e.instanceId, []);
      eventsByInstance.get(e.instanceId)!.push(e);
    }

    return {
      templateName: toTemplate(templateRecord).name,
      fieldLabels: templateFields.map((f) => f.label),
      steps: templateSteps.map((s) => ({
        stepNo: s.stepNo,
        what: s.what,
        doerName: doerNameById.get(s.doerId) ?? s.doerId,
        how: s.how,
        tat: s.tat,
      })),
      runs: instances.map((inst) => {
        const instEvents = eventsByInstance.get(inst.id) ?? [];
        return {
          id: inst.id,
          title: inst.title,
          status: inst.status,
          startedAt: inst.startedAt,
          fieldValues: inst.fieldValues.map((f) => f.value),
          steps: templateSteps.map((s) => {
            const ev = instEvents.find((e) => e.stepNo === s.stepNo);
            return {
              stepNo: s.stepNo,
              planned: ev?.planned ?? "",
              actual: ev?.actual ?? "",
              status: ev?.status ?? "Pending",
              delayMinutes: ev ? computeDelayMinutes(ev) : null,
            };
          }),
        };
      }),
    };
  },

  /**
   * Everything currently in flight, across every template, in one pass.
   *
   * The per-template sheet answers "how is this workflow doing"; it cannot
   * answer "what is late anywhere right now", which is the question whoever
   * runs the floor actually asks. Doing that by opening each template in turn
   * stops working the moment there are more than a handful, so this collapses
   * the whole board into one flat, already-sorted list plus the counts needed
   * to decide where to look — from a single read of each table rather than one
   * round trip per template.
   */
  async getOverview(): Promise<{
    totals: { activeRuns: number; overdueSteps: number; dueTodaySteps: number };
    templates: Array<{ id: string; name: string; activeRuns: number; overdueSteps: number }>;
    /** Exact per-person load across every outstanding step, not just sampled ones. */
    people: Array<{ doerId: string; doerName: string; total: number; overdue: number }>;
    buckets: Array<{
      key: string;
      templateId: string;
      templateName: string;
      stepNo: number;
      what: string;
      how: string;
      doerId: string;
      doerName: string;
      total: number;
      overdue: number;
      nextDue: string;
      runs: Array<{
        instanceId: string;
        runTitle: string;
        planned: string;
        status: WorkflowStepStatus;
        /** How late this step is *right now* (minutes), or null if not overdue. */
        lateMinutes: number | null;
      }>;
    }>;
  }> {
    // Only in-flight runs matter here — a Complete run has nothing outstanding,
    // and its whole step history is dead weight on this query. Finished work is
    // the bulk of the table over time, so filtering both reads down to Active
    // keeps this roughly flat as history piles up.
    const [templateRecords, instanceRecords, users] = await Promise.all([
      dataService.findAll(templatesEntity),
      dataService.findWhere(instancesEntity, "Status", "Active"),
      usersService.list(),
    ]);

    const doerNameById = new Map(users.map((u) => [u.id, u.name]));
    const templates = templateRecords.map(toTemplate);
    const templateById = new Map(templates.map((t) => [t.id, t]));

    const activeInstances = instanceRecords.map(toInstance);
    const instanceById = new Map(activeInstances.map((i) => [i.id, i]));

    const eventRecords = await dataService.findWhereIn(
      eventsEntity,
      "Instance ID",
      activeInstances.map((i) => i.id)
    );

    const activeRunsByTemplate = new Map<string, number>();
    for (const inst of activeInstances) {
      activeRunsByTemplate.set(inst.templateId, (activeRunsByTemplate.get(inst.templateId) ?? 0) + 1);
    }

    const now = Date.now();
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    const overdueByTemplate = new Map<string, number>();
    let dueTodaySteps = 0;

    const attention = eventRecords
      .map(toEvent)
      .filter((e) => instanceById.has(e.instanceId))
      .map(withDerivedStatus)
      // Whoever's turn it is right now — Pending steps have no one waiting on
      // them yet, and Complete ones are already done.
      .filter((e) => e.status === "Active" || e.status === "Overdue")
      .map((step) => {
        const instance = instanceById.get(step.instanceId)!;
        const template = templateById.get(instance.templateId);
        const plannedMs = step.planned ? new Date(step.planned).getTime() : NaN;
        const late = step.status === "Overdue" && !Number.isNaN(plannedMs);

        if (step.status === "Overdue") {
          overdueByTemplate.set(instance.templateId, (overdueByTemplate.get(instance.templateId) ?? 0) + 1);
        }
        if (
          !Number.isNaN(plannedMs) &&
          new Date(plannedMs).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === today
        ) {
          dueTodaySteps += 1;
        }

        return {
          instanceId: instance.id,
          templateId: instance.templateId,
          templateName: template?.name ?? "",
          // Whatever the template's first field is, that value is what people
          // call this run — the template decides, not this code.
          runTitle: instance.fieldValues[0]?.value || instance.title,
          stepNo: step.stepNo,
          what: step.what,
          how: step.how,
          doerId: step.doerId,
          doerName: doerNameById.get(step.doerId) ?? step.doerId,
          planned: step.planned,
          status: step.status,
          lateMinutes: late ? Math.round((now - plannedMs) / 60000) : null,
        };
      })
      .sort((a, b) => {
        // Late work first, most overdue at the top; then whatever is due soonest.
        if ((a.lateMinutes !== null) !== (b.lateMinutes !== null)) return a.lateMinutes !== null ? -1 : 1;
        if (a.lateMinutes !== null && b.lateMinutes !== null) return b.lateMinutes - a.lateMinutes;
        return (a.planned || "9999").localeCompare(b.planned || "9999");
      });

    // Who is holding what, counted over *every* outstanding step — these totals
    // must stay exact even though the buckets below only carry a sample.
    const peopleById = new Map<string, { doerId: string; doerName: string; total: number; overdue: number }>();
    for (const a of attention) {
      const p = peopleById.get(a.doerId) ?? { doerId: a.doerId, doerName: a.doerName, total: 0, overdue: 0 };
      p.total += 1;
      if (a.lateMinutes !== null) p.overdue += 1;
      peopleById.set(a.doerId, p);
    }

    /*
     * One template can carry a thousand runs, and they pile up at the same
     * step under the same person — so a flat list is a thousand near-identical
     * rows nobody can act on, and a payload that grows with the backlog.
     *
     * Grouping by (workflow, step, person) turns that pile into the one fact
     * it actually represents: "this person has 1000 runs sitting on this step,
     * 12 of them late." Each group carries exact counts but only its most
     * urgent handful of runs, so the response is bounded by how the workflows
     * are configured rather than by how much work is outstanding.
     */
    const bucketMap = new Map<string, (typeof buckets)[number]>();
    const buckets: Array<{
      key: string;
      templateId: string;
      templateName: string;
      stepNo: number;
      what: string;
      how: string;
      doerId: string;
      doerName: string;
      /** Exact number of runs waiting at this step for this person. */
      total: number;
      overdue: number;
      /** Earliest deadline in the group — when this group next needs attention. */
      nextDue: string;
      /** The most urgent few only; `total` says how many there really are. */
      runs: Array<{
        instanceId: string;
        runTitle: string;
        planned: string;
        status: WorkflowStepStatus;
        lateMinutes: number | null;
      }>;
    }> = [];

    for (const a of attention) {
      const key = `${a.templateId}:${a.stepNo}:${a.doerId}`;
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = {
          key,
          templateId: a.templateId,
          templateName: a.templateName,
          stepNo: a.stepNo,
          what: a.what,
          how: a.how,
          doerId: a.doerId,
          doerName: a.doerName,
          total: 0,
          overdue: 0,
          nextDue: "",
          runs: [],
        };
        bucketMap.set(key, bucket);
        buckets.push(bucket);
      }
      bucket.total += 1;
      if (a.lateMinutes !== null) bucket.overdue += 1;
      if (a.planned && (!bucket.nextDue || a.planned < bucket.nextDue)) bucket.nextDue = a.planned;
      // `attention` is already most-urgent-first, so the first ones in are the
      // ones worth keeping.
      if (bucket.runs.length < BUCKET_SAMPLE_SIZE) {
        bucket.runs.push({
          instanceId: a.instanceId,
          runTitle: a.runTitle,
          planned: a.planned,
          status: a.status,
          lateMinutes: a.lateMinutes,
        });
      }
    }

    buckets.sort((a, b) => {
      if (a.overdue !== b.overdue) return b.overdue - a.overdue;
      return (a.nextDue || "9999").localeCompare(b.nextDue || "9999");
    });

    return {
      totals: {
        activeRuns: activeInstances.length,
        overdueSteps: attention.filter((a) => a.lateMinutes !== null).length,
        dueTodaySteps,
      },
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        activeRuns: activeRunsByTemplate.get(t.id) ?? 0,
        overdueSteps: overdueByTemplate.get(t.id) ?? 0,
      })),
      people: Array.from(peopleById.values()).sort((a, b) => b.total - a.total),
      buckets,
    };
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
      /** The template this run belongs to — which workflow this actually is. */
      templateName: string;
      /** Whatever fields this template collects, so the doer knows what this is about. */
      fieldValues: WorkflowFieldValue[];
      totalSteps: number;
      isMyTurn: boolean;
      /** Resolved name for the step's WHO, so the doer view needs no user lookup. */
      doerName: string;
      step: WorkflowStepEvent;
    }>
  > {
    // This person's own step events, not everybody's — the read scales with
    // their workload rather than with the whole company's history.
    const [instanceRecords, myEventRecords, templateRecords, doer] = await Promise.all([
      dataService.findWhere(instancesEntity, "Status", "Active"),
      dataService.findWhere(eventsEntity, "Doer ID", doerId),
      dataService.findAll(templatesEntity),
      usersService.getById(doerId).catch(() => null),
    ]);

    const activeInstances = instanceRecords.map(toInstance);
    const instanceById = new Map(activeInstances.map((i) => [i.id, i]));
    const templateNameById = new Map(templateRecords.map(toTemplate).map((t) => [t.id, t.name]));

    const events = myEventRecords.map(toEvent).filter((e) => instanceById.has(e.instanceId));

    // "Step 2 of 5" counts every step of the run, including other people's, so
    // it needs the runs' full event sets — but only for the runs actually shown.
    const siblingRecords = await dataService.findWhereIn(
      eventsEntity,
      "Instance ID",
      events.map((e) => e.instanceId)
    );
    const stepCountByInstance = new Map<string, number>();
    for (const raw of siblingRecords) {
      const instanceId = raw["Instance ID"] ?? "";
      stepCountByInstance.set(instanceId, (stepCountByInstance.get(instanceId) ?? 0) + 1);
    }

    return events
      .map(withDerivedStatus)
      // A finished step is history, not work — leave it out of their list.
      .filter((e) => e.status !== "Complete")
      .map((step) => {
        const instance = instanceById.get(step.instanceId)!;
        return {
          instanceId: instance.id,
          instanceTitle: instance.title,
          instanceDetails: instance.details,
          templateName: templateNameById.get(instance.templateId) ?? "",
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

    // The template's first field names the run, which is why there's no
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
    reason: string,
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
        detail: `Step ${stepNo} exceeded ${MAX_REWORK} reworks — escalated, not auto-reopened. Reason: ${reason}`,
      });
    } else {
      // The reason lands on the REOPENED step, not the rejecting one — that's
      // whose screen needs to explain "why is this back with me".
      await dataService.updateById(eventsEntity, previous.id, {
        Status: "Active",
        Actual: "",
        "Reject Reason": reason,
      });
      await activityService.log({
        user: actorId,
        action: "Workflow step rejected",
        task: current.what,
        detail: `Step ${stepNo} rejected — step ${stepNo - 1} (${previous.what}) reopened for rework. Reason: ${reason}`,
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
