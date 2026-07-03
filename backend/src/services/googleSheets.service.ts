import { google, sheets_v4 } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { env, hasGoogleCredentials } from "../config/env";
import type { SheetEntityConfig } from "../config/sheets.config";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export type SheetRecord = Record<string, string>;

interface ReadResult {
  headers: string[];
  /** Records in sheet order, each tagged with its 1-indexed sheet row number. */
  rows: Array<{ row: number; data: SheetRecord }>;
}

/**
 * Thin, reusable wrapper around the Google Sheets API v4.
 *
 * Every other service in this backend goes through here instead of calling
 * googleapis directly. Nothing here knows about "tasks" or "users" — it only
 * understands generic sheets, header rows, and IDs. Domain services
 * (tasks.service.ts, users.service.ts, ...) supply a SheetEntityConfig and
 * work with plain records.
 *
 * Design notes:
 *  - Auth is lazy: constructing this class never throws. Credentials are
 *    only required (and validated) the first time a call actually needs
 *    Google Sheets, so the rest of the app can boot and respond to health
 *    checks before Google credentials are provided.
 *  - All lookups/updates/deletes go by ID (a value in the entity's
 *    `idColumn`), never by row number. Row numbers are resolved internally,
 *    on demand, right before a write, to avoid acting on stale positions.
 *  - The tab's numeric sheetId (needed for row-delete batchUpdate calls) is
 *    cached per spreadsheet+tab after first lookup.
 */
class GoogleSheetsService {
  private sheetsClient: sheets_v4.Sheets | null = null;
  private authClientPromise: Promise<sheets_v4.Sheets> | null = null;
  private tabIdCache = new Map<string, number>();

  private async getClient(): Promise<sheets_v4.Sheets> {
    if (this.sheetsClient) return this.sheetsClient;

    if (!hasGoogleCredentials()) {
      throw AppError.serviceUnavailable(
        "Google Sheets credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON " +
          "(or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS) " +
          "in your .env file. No code changes are required once credentials are added."
      );
    }

    if (!this.authClientPromise) {
      this.authClientPromise = this.buildClient();
    }

    this.sheetsClient = await this.authClientPromise;
    return this.sheetsClient;
  }

  private async buildClient(): Promise<sheets_v4.Sheets> {
    try {
      let auth: GoogleAuth;

      if (env.google.serviceAccountJson) {
        const credentials = JSON.parse(env.google.serviceAccountJson);
        auth = new GoogleAuth({ credentials, scopes: SCOPES });
      } else if (env.google.serviceAccountEmail && env.google.privateKey) {
        auth = new GoogleAuth({
          credentials: {
            client_email: env.google.serviceAccountEmail,
            private_key: env.google.privateKey,
          },
          scopes: SCOPES,
        });
      } else if (env.google.applicationCredentialsPath) {
        auth = new GoogleAuth({
          keyFile: env.google.applicationCredentialsPath,
          scopes: SCOPES,
        });
      } else {
        // Should be unreachable — hasGoogleCredentials() already guarded this.
        throw AppError.serviceUnavailable();
      }

      const authClient = await auth.getClient();
      // Log which credential source was used — never the credentials themselves.
      const source = env.google.serviceAccountJson
        ? "GOOGLE_SERVICE_ACCOUNT_JSON"
        : env.google.serviceAccountEmail
          ? "GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY"
          : "GOOGLE_SERVICE_ACCOUNT_PATH";
      logger.info({ source }, "Google Sheets client authenticated");
      return google.sheets({ version: "v4", auth: authClient as never });
    } catch (error) {
      this.authClientPromise = null;
      // Log only the error's message/name — never dump the raw error object,
      // which for auth failures can echo back parts of the credentials.
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ errorMessage: message }, "Failed to initialize Google Sheets client");
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Failed to authenticate with Google Sheets. Check your service account credentials.",
        503,
        "SHEETS_AUTH_FAILED"
      );
    }
  }

  /**
   * Runs a raw Google API call and translates failures into AppErrors with
   * actionable messages (permission/sharing issues, missing spreadsheet,
   * rate limits, ...) instead of letting a raw googleapis/Gaxios error
   * reach the client. AppErrors thrown deliberately elsewhere (e.g.
   * notFound) pass through untouched.
   *
   * Transient network failures — "Premature close", socket hang up,
   * ECONNRESET, timeouts, etc. — are common when talking to Google's OAuth
   * token endpoint from container platforms (IPv6/keepalive quirks), so
   * those are retried a few times with exponential backoff before being
   * surfaced as an error.
   */
  private async withErrorHandling<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const maxAttempts = 4;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AppError) throw error;
        lastError = error;

        if (isTransientNetworkError(error) && attempt < maxAttempts) {
          const backoffMs = 300 * 2 ** (attempt - 1); // 300, 600, 1200 ms
          logger.warn(
            { operation, attempt, backoffMs },
            "Transient Google API network error — retrying"
          );
          await sleep(backoffMs);
          continue;
        }
        break;
      }
    }

    {
      const error = lastError;
      const gaxiosError = error as {
        code?: number | string;
        response?: { status?: number; data?: { error?: { message?: string } } };
        message?: string;
      };
      const status =
        gaxiosError.response?.status ??
        (typeof gaxiosError.code === "number" ? gaxiosError.code : undefined);
      const apiMessage =
        gaxiosError.response?.data?.error?.message ?? gaxiosError.message ?? "Unknown error";

      logger.error({ operation, status, apiMessage }, "Google Sheets API call failed");

      if (status === 403) {
        throw new AppError(
          "Google Sheets denied access. Share the spreadsheet with the service account's " +
            "client_email as Editor, and confirm the Sheets API is enabled.",
          502,
          "SHEETS_PERMISSION_DENIED"
        );
      }
      if (status === 404) {
        throw new AppError(
          "Spreadsheet not found. Check GOOGLE_SPREADSHEET_ID in your .env file.",
          502,
          "SHEETS_SPREADSHEET_NOT_FOUND"
        );
      }
      if (status === 429) {
        throw new AppError(
          "Google Sheets API rate limit exceeded. Please try again shortly.",
          429,
          "SHEETS_RATE_LIMITED"
        );
      }
      throw new AppError(`Google Sheets API error during ${operation}: ${apiMessage}`, 502, "SHEETS_API_ERROR");
    }
  }

  private assertSpreadsheetId(entity: SheetEntityConfig): string {
    if (!entity.spreadsheetId) {
      throw AppError.serviceUnavailable(
        `No spreadsheet ID configured for sheet "${entity.sheetName}". ` +
          "Set GOOGLE_SPREADSHEET_ID (or the sheet-specific override) in your .env file."
      );
    }
    return entity.spreadsheetId;
  }

  /**
   * Resolves and caches the numeric tab ID for a sheet. If the tab doesn't
   * exist yet, creates it and writes the expected header row — this is the
   * "create sheets/headers automatically if missing" behavior.
   */
  private async getTabId(entity: SheetEntityConfig): Promise<number> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const cacheKey = `${spreadsheetId}::${entity.sheetName}`;
    const cached = this.tabIdCache.get(cacheKey);
    if (cached !== undefined) return cached;

    return this.withErrorHandling(`getTabId(${entity.sheetName})`, async () => {
      const client = await this.getClient();
      const meta = await client.spreadsheets.get({ spreadsheetId });
      const sheet = meta.data.sheets?.find((s) => s.properties?.title === entity.sheetName);

      if (sheet?.properties?.sheetId !== undefined && sheet.properties.sheetId !== null) {
        this.tabIdCache.set(cacheKey, sheet.properties.sheetId);
        return sheet.properties.sheetId;
      }

      logger.info({ sheetName: entity.sheetName }, "Tab not found — creating it with headers");

      // Tab doesn't exist yet — create it with the expected header row.
      const addResponse = await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: entity.sheetName } } }],
        },
      });
      const newTabId = addResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;

      if (newTabId === undefined) {
        throw new AppError(
          `Failed to create missing tab "${entity.sheetName}" in spreadsheet.`,
          502,
          "SHEETS_TAB_CREATE_FAILED"
        );
      }

      await client.spreadsheets.values.update({
        spreadsheetId,
        range: `'${entity.sheetName}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [entity.expectedHeaders] },
      });

      this.tabIdCache.set(cacheKey, newTabId);
      return newTabId;
    });
  }

  /** Reads the full tab and parses it into header-keyed records, tagged with sheet row numbers. */
  async readAll(entity: SheetEntityConfig): Promise<ReadResult> {
    const spreadsheetId = this.assertSpreadsheetId(entity);

    // Ensures the tab (and its header row) exists before reading.
    await this.getTabId(entity);

    return this.withErrorHandling(`readAll(${entity.sheetName})`, async () => {
      const client = await this.getClient();
      const response = await client.spreadsheets.values.get({
        spreadsheetId,
        range: `'${entity.sheetName}'!A1:ZZ`,
      });

      const values = response.data.values ?? [];
      if (values.length === 0) {
        return { headers: entity.expectedHeaders, rows: [] };
      }

      const headers = (values[0] ?? []).map((h) => String(h).trim());
      const rows: ReadResult["rows"] = [];

      for (let i = 1; i < values.length; i++) {
        const rawRow = values[i] ?? [];
        if (rawRow.every((cell) => cell === undefined || cell === "")) continue;

        const data: SheetRecord = {};
        headers.forEach((header, colIndex) => {
          data[header] = String(rawRow[colIndex] ?? "");
        });

        rows.push({ row: i + 1, data });
      }

      return { headers, rows };
    });
  }

  async findAll(entity: SheetEntityConfig): Promise<SheetRecord[]> {
    const { rows } = await this.readAll(entity);
    return rows.map((r) => r.data);
  }

  async findById(entity: SheetEntityConfig, id: string): Promise<SheetRecord | null> {
    const { rows } = await this.readAll(entity);
    const match = rows.find((r) => r.data[entity.idColumn] === id);
    return match ? match.data : null;
  }

  async append(entity: SheetEntityConfig, record: SheetRecord): Promise<SheetRecord> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const { headers } = await this.readAll(entity);
    const orderedHeaders = headers.length > 0 ? headers : entity.expectedHeaders;
    const rowValues = orderedHeaders.map((header) => record[header] ?? "");

    return this.withErrorHandling(`append(${entity.sheetName})`, async () => {
      const client = await this.getClient();
      await client.spreadsheets.values.append({
        spreadsheetId,
        range: `'${entity.sheetName}'!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [rowValues] },
      });

      const result: SheetRecord = {};
      orderedHeaders.forEach((header, i) => {
        result[header] = rowValues[i] ?? "";
      });
      return result;
    });
  }

  async updateById(
    entity: SheetEntityConfig,
    id: string,
    updates: Partial<SheetRecord>
  ): Promise<SheetRecord> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const { headers, rows } = await this.readAll(entity);

    const match = rows.find((r) => r.data[entity.idColumn] === id);
    if (!match) {
      throw AppError.notFound(
        `No record with ${entity.idColumn} "${id}" in "${entity.sheetName}".`
      );
    }

    const merged: SheetRecord = { ...match.data };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) merged[key] = value;
    }
    const rowValues = headers.map((header) => merged[header] ?? "");

    return this.withErrorHandling(`updateById(${entity.sheetName})`, async () => {
      const client = await this.getClient();
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: `'${entity.sheetName}'!A${match.row}:${columnLetter(headers.length)}${match.row}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowValues] },
      });

      return merged;
    });
  }

  async deleteById(entity: SheetEntityConfig, id: string): Promise<void> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const { rows } = await this.readAll(entity);

    const match = rows.find((r) => r.data[entity.idColumn] === id);
    if (!match) {
      throw AppError.notFound(
        `No record with ${entity.idColumn} "${id}" in "${entity.sheetName}".`
      );
    }

    const tabId = await this.getTabId(entity);

    await this.withErrorHandling(`deleteById(${entity.sheetName})`, async () => {
      const client = await this.getClient();
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: tabId,
                  dimension: "ROWS",
                  startIndex: match.row - 1,
                  endIndex: match.row,
                },
              },
            },
          ],
        },
      });
    });
  }

  // ---- Spec-named aliases -------------------------------------------------
  // The four CRUD verbs above (findAll/readAll, append, updateById,
  // deleteById) are the names used throughout this codebase. These aliases
  // exist so the service also satisfies the connect()/readSheet()/
  // appendRow()/updateRow()/deleteRow() surface some integrations expect —
  // they're thin wrappers, not separate implementations.

  /** Establishes (and warms) the Google Sheets client. Throws if credentials are missing/invalid. */
  async connect(): Promise<void> {
    await this.getClient();
  }

  async readSheet(entity: SheetEntityConfig): Promise<ReadResult> {
    return this.readAll(entity);
  }

  async appendRow(entity: SheetEntityConfig, record: SheetRecord): Promise<SheetRecord> {
    return this.append(entity, record);
  }

  async updateRow(
    entity: SheetEntityConfig,
    id: string,
    updates: Partial<SheetRecord>
  ): Promise<SheetRecord> {
    return this.updateById(entity, id, updates);
  }

  async deleteRow(entity: SheetEntityConfig, id: string): Promise<void> {
    return this.deleteById(entity, id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True for connection-level failures that are worth retrying — dropped
 * sockets, DNS hiccups, and timeouts when reaching Google's servers.
 * These carry no HTTP status because the response never completed.
 */
function isTransientNetworkError(error: unknown): boolean {
  const err = error as { code?: string | number; message?: string; cause?: { code?: string } };
  const code = String(err.code ?? err.cause?.code ?? "");
  const message = (err.message ?? "").toLowerCase();

  const transientCodes = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "EPIPE",
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
  ];
  if (transientCodes.includes(code)) return true;

  return (
    message.includes("premature close") ||
    message.includes("socket hang up") ||
    message.includes("network socket disconnected") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("terminated")
  );
}

/** Converts a 1-indexed column number to its A1 letter (1 -> A, 27 -> AA). */
function columnLetter(index: number): string {
  let n = index;
  let letters = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters || "A";
}

export const googleSheetsService = new GoogleSheetsService();
