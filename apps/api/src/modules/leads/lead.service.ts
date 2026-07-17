import type { CreateLeadRequest, CreateLeadResponse } from "@argus/shared";
import { createLeadRecord } from "./lead.repository.js";

export async function createLead(request: CreateLeadRequest): Promise<CreateLeadResponse> {
  const lead = await createLeadRecord(request.path);
  return {
    id: lead.id,
    path: lead.path,
    createdAt: lead.createdAt.toISOString(),
  };
}
