import type { NextRequest } from "next/server";
import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import { parseDuesFinanceMutationBody, type DuesFinanceMutation } from "@/lib/dues-finance/validation";
import {
  authenticatedDuesFinanceClient,
  duesFinanceFailure,
  duesFinanceMutationAllowed,
  duesFinanceRpcFailure,
  duesFinanceSuccess,
  readDuesFinanceJson,
} from "@/lib/dues-finance/http";

export const dynamic = "force-dynamic";

function rpcArgs(mutation: DuesFinanceMutation) {
  switch (mutation.action) {
    case "set_annual_default":
      return ["set_club_dues_annual_default", {
        p_club_id: mutation.clubId,
        p_rotary_year_id: mutation.rotaryYearId,
        p_default_amount: mutation.defaultAmount,
        p_reason: mutation.reason,
      }] as const;
    case "generate_receivables":
      return ["generate_club_dues_receivables", {
        p_club_id: mutation.clubId,
        p_rotary_year_id: mutation.rotaryYearId,
        p_source_note: mutation.sourceNote,
      }] as const;
    case "create_receivable":
      return ["create_dues_receivable", {
        p_club_id: mutation.clubId,
        p_rotary_year_id: mutation.rotaryYearId,
        p_membership_id: mutation.membershipId,
        p_amount: mutation.amount,
        p_source_note: mutation.sourceNote,
        p_source_kind: mutation.sourceKind,
        p_idempotency_key: mutation.idempotencyKey,
      }] as const;
    case "adjust_receivable":
      return ["adjust_dues_receivable", {
        p_club_id: mutation.clubId,
        p_receivable_id: mutation.receivableId,
        p_amount_delta: mutation.amountDelta,
        p_reason: mutation.reason,
        p_idempotency_key: mutation.idempotencyKey,
      }] as const;
    case "record_receipt":
      return ["record_dues_receipt", {
        p_club_id: mutation.clubId,
        p_received_on: mutation.receivedOn,
        p_payment_method: mutation.paymentMethod,
        p_reference_note: mutation.referenceNote,
        p_items: mutation.allocations.map((allocation) => ({
          receivable_id: allocation.receivableId,
          amount: allocation.amount,
        })),
        p_idempotency_key: mutation.idempotencyKey,
      }] as const;
    case "reverse_receipt":
      return ["reverse_dues_receipt", {
        p_club_id: mutation.clubId,
        p_receipt_id: mutation.receiptId,
        p_reason: mutation.reason,
      }] as const;
    case "submit_advance":
      return ["submit_dues_advance", {
        p_club_id: mutation.clubId,
        p_rotary_year_id: mutation.rotaryYearId,
        p_amount: mutation.amount,
        p_description: mutation.description,
        p_incurred_on: mutation.incurredOn,
        p_idempotency_key: mutation.idempotencyKey,
        p_payer_membership_id: mutation.payerMembershipId,
      }] as const;
    case "return_advance":
      return ["return_dues_advance", {
        p_club_id: mutation.clubId,
        p_advance_id: mutation.advanceId,
        p_reason: mutation.reason,
      }] as const;
    case "resubmit_advance":
      return ["resubmit_dues_advance", {
        p_club_id: mutation.clubId,
        p_advance_id: mutation.advanceId,
        p_note: mutation.note,
      }] as const;
    case "approve_reconciliation":
      return ["approve_dues_reconciliation", {
        p_club_id: mutation.clubId,
        p_advance_id: mutation.advanceId,
        p_amount: mutation.amount,
        p_approval_note: mutation.approvalNote,
        p_idempotency_key: mutation.idempotencyKey,
      }] as const;
    case "set_remit_key":
      return ["set_membership_remit_key", {
        p_club_id: mutation.clubId,
        p_membership_id: mutation.membershipId,
        p_key_kind: mutation.keyKind,
        p_key_value: mutation.keyValue,
        p_note: mutation.note,
      }] as const;
    case "reverse_reconciliation":
      return ["reverse_dues_reconciliation", {
        p_club_id: mutation.clubId,
        p_reconciliation_id: mutation.reconciliationId,
        p_reason: mutation.reason,
      }] as const;
  }
}

export async function POST(request: NextRequest) {
  if (!duesFinanceMutationAllowed(request)) return duesFinanceFailure(403);
  const { client, user } = await authenticatedDuesFinanceClient();
  if (!user) return duesFinanceFailure(401);
  const evaluation = await evaluateCurrentFeatureFlag({ key: "dues_finance_v1", subjectUuid: user.id });
  if (!evaluation.enabled) return duesFinanceFailure(404);

  let mutation: DuesFinanceMutation;
  try {
    mutation = parseDuesFinanceMutationBody(await readDuesFinanceJson(request));
  } catch {
    return duesFinanceFailure(400);
  }

  const [functionName, args] = rpcArgs(mutation);
  const { data, error } = await client.rpc(functionName, args);
  if (error) return duesFinanceRpcFailure(error);
  return duesFinanceSuccess(data, mutation.action === "record_receipt" ? 201 : 200);
}
