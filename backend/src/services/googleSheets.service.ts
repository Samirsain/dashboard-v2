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
      return google.sheets({ version: "v4", auth: authClient as never });
    } catch (error) {
      this.authClientPromise = null;
      logger.error({ err: error }, "Failed to initialize Google Sheets client");
      if (error instanceof AppError) throw error;
      throw new AppError(
        "Failed to authenticate with Google Sheets. Check your service account credentials.",
        503,
        "SHEETS_AUTH_FAILED"
      );
    }
  }

  private assertSpreadsheetId(entity: SheetEntityConfig): string {
    if (!entity.spreadsheetId) {
      throw AppError.serviceUnavailable(
        `No spreadsheet ID configured for sheet "${entity.sheetName}". ` +
          "Set GOOGLE_SHEETS_SPREADSHEET_ID (or the sheet-specific override) in your .env file."
      );
    }
    return entity.spreadsheetId;
  }

  /** Resolves and caches the numeric tab ID for a sheet, creating the tab if it doesn't exist. */
  private async getTabId(entity: SheetEntityConfig): Promise<number> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const cacheKey = `${spreadsheetId}::${entity.sheetName}`;
    const cached = this.tabIdCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const client = await this.getClient();
    const meta = await client.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find(
      (s) => s.properties?.title === entity.sheetName
    );

    if (sheet?.properties?.sheetId !== undefined && sheet.properties.sheetId !== null) {
      this.tabIdCache.set(cacheKey, sheet.properties.sheetId);
      return sheet.properties.sheetId;
    }

    // Tab doesn't exist yet — create it with the expected header row.
    const addResponse = await client.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: entity.sheetName } } }],
      },
    });
    const newTabId =
      addResponse.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;

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
  }

  /** Reads the full tab and parses it into header-keyed records, tagged with sheet row numbers. */
  async readAll(entity: SheetEntityConfig): Promise<ReadResult> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const client = await this.getClient();

    // Ensures the tab (and its header row) exists before reading.
    await this.getTabId(entity);

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
    const client = await this.getClient();
    const { headers } = await this.readAll(entity);

    const orderedHeaders = headers.length > 0 ? headers : entity.expectedHeaders;
    const rowValues = orderedHeaders.map((header) => record[header] ?? "");

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
  }

  async updateById(
    entity: SheetEntityConfig,
    id: string,
    updates: Partial<SheetRecord>
  ): Promise<SheetRecord> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const client = await this.getClient();
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

    await client.spreadsheets.values.update({
      spreadsheetId,
      range: `'${entity.sheetName}'!A${match.row}:${columnLetter(headers.length)}${match.row}`,
      valueInputOption: "RAW",
      requestBody: { values: [rowValues] },
    });

    return merged;
  }

  async deleteById(entity: SheetEntityConfig, id: string): Promise<void> {
    const spreadsheetId = this.assertSpreadsheetId(entity);
    const client = await this.getClient();
    const { rows } = await this.readAll(entity);

    const match = rows.find((r) => r.data[entity.idColumn] === id);
    if (!match) {
      throw AppError.notFound(
        `No record with ${entity.idColumn} "${id}" in "${entity.sheetName}".`
      );
    }

    const tabId = await this.getTabId(entity);

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
  }
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
