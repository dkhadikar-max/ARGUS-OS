import type { Request, Response, NextFunction } from "express";
import type { CreateLeadRequest } from "@argus/shared";
import { createLead } from "./lead.service.js";

export async function createLeadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body as CreateLeadRequest;
    const lead = await createLead(body);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
}
