import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ok, created } from "../utils/response";
import { imsService } from "../services/ims.service";
import type {
  CreateImsItemInput,
  UpdateImsItemInput,
  CreateImsTransactionInput,
} from "../validation/ims.schema";

export const imsController = {
  listItems: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await imsService.listItems());
  }),

  createItem: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateImsItemInput;
    created(res, await imsService.createItem(input));
  }),

  updateItem: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as UpdateImsItemInput;
    ok(res, await imsService.updateItem(req.params.skuCode as string, input));
  }),

  removeItem: asyncHandler(async (req: Request, res: Response) => {
    await imsService.removeItem(req.params.skuCode as string);
    ok(res, { deleted: true });
  }),

  listTransactions: asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.query as { sku?: string };
    ok(res, await imsService.listTransactions(sku));
  }),

  createTransaction: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateImsTransactionInput;
    created(res, await imsService.createTransaction(input, req.user!.sub));
  }),

  removeTransaction: asyncHandler(async (req: Request, res: Response) => {
    await imsService.removeTransaction(req.params.id as string);
    ok(res, { deleted: true });
  }),

  stockLedger: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await imsService.stockLedger());
  }),

  reorderSheet: asyncHandler(async (_req: Request, res: Response) => {
    ok(res, await imsService.reorderSheet());
  }),
};
