import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createTrustedAdminClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createTrustedAdminClient: mocks.createTrustedAdminClient }));

import * as route from "./route";

const clubId = "42000000-0000-4000-8000-000000000001";
const itemId = "52000000-0000-4000-8000-000000000001";
const versionId = "62000000-0000-4000-8000-000000000001";
const objectPath = `${clubId}/${itemId}/${versionId}`;

function request(origin = "http://localhost:3000", fetchSite = "same-origin") {
  const formData = new FormData();
  formData.set("clubId", clubId);
  formData.set("itemId", itemId);
  formData.set("changeSummary", "驗證上傳");
  formData.set("file", new File(["archive test"], "handover.txt", { type: "text/plain" }));
  return new NextRequest("http://localhost:3000/api/v1/archive/uploads", {
    method: "POST",
    headers: { origin, "sec-fetch-site": fetchSite },
    body: formData,
  });
}

function configureClient() {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user" } }, error: null });
  mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  mocks.from.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.createTrustedAdminClient.mockReturnValue({ storage: { from: mocks.from } });
}

describe("POST /api/v1/archive/uploads", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.createTrustedAdminClient.mockReset();
    mocks.getUser.mockReset();
    mocks.rpc.mockReset();
    mocks.from.mockReset();
    mocks.upload.mockReset();
    mocks.remove.mockReset().mockResolvedValue({ data: [], error: null });
    configureClient();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("starts, uploads, and completes one immutable version", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { version_id: versionId, object_path: objectPath }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.upload.mockResolvedValue({ data: { path: objectPath }, error: null });

    const response = await route.POST(request());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { uploaded: true } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "begin_archive_version", expect.objectContaining({
      p_club_id: clubId,
      p_archive_item_id: itemId,
      p_original_filename: "handover.txt",
    }));
    expect(mocks.upload).toHaveBeenCalledWith(objectPath, expect.any(Buffer), expect.objectContaining({
      contentType: "text/plain",
      upsert: false,
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "complete_archive_version", {
      p_club_id: clubId,
      p_version_id: versionId,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("marks the version failed and removes a possibly partial object when Storage fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { version_id: versionId, object_path: objectPath }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.upload.mockResolvedValue({ data: null, error: { message: "storage-secret-detail" } });

    const response = await route.POST(request());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "request_failed" });
    expect(JSON.stringify(body)).not.toContain("storage-secret-detail");
    expect(mocks.remove).toHaveBeenCalledWith([objectPath]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_archive_version", {
      p_club_id: clubId,
      p_version_id: versionId,
      p_reason: "storage_upload_failed",
    });
  });

  it("removes the object and marks the version failed when finalization fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { version_id: versionId, object_path: objectPath }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "finalize-secret-detail" } })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.upload.mockResolvedValue({ data: { path: objectPath }, error: null });

    const response = await route.POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(mocks.remove).toHaveBeenCalledWith([objectPath]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "fail_archive_version", {
      p_club_id: clubId,
      p_version_id: versionId,
      p_reason: "metadata_finalize_failed",
    });
  });

  it("marks the version failed when trusted Storage is unavailable", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { version_id: versionId, object_path: objectPath }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.createTrustedAdminClient.mockImplementation(() => {
      throw new Error("service-role-secret-detail");
    });

    const response = await route.POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_archive_version", {
      p_club_id: clubId,
      p_version_id: versionId,
      p_reason: "trusted_storage_unavailable",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("marks the version failed when the request file cannot be read", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { version_id: versionId, object_path: objectPath }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const readFile = vi.spyOn(File.prototype, "arrayBuffer").mockRejectedValueOnce(new Error("file-secret-detail"));
    const response = await route.POST(request()).finally(() => readFile.mockRestore());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "fail_archive_version", {
      p_club_id: clubId,
      p_version_id: versionId,
      p_reason: "file_read_failed",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not touch trusted Storage when the database rejects another club", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "archive_manager_required" },
    });

    const response = await route.POST(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests before authentication or Storage access", async () => {
    const response = await route.POST(request("https://evil.example", "cross-site"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "request_failed" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });
});
