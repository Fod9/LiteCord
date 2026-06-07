import { describe, it, expect, vi, beforeEach } from "vitest";
import { addFriend, listFriends, listPendingRequests, updateFriendRequest, deleteFriend } from "../friends";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockFriendship = {
  id: "friendship:abc",
  in_user: { id: "user:me", name: "Me", display_name: "Me", profile_picture: "" },
  out_user: { id: "user:friend", name: "Friend", display_name: "Friend", profile_picture: "" },
  status: "accepted",
  created_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("addFriend", () => {
  it("invokes 'add_friend' avec le nom et retourne la confirmation", async () => {
    vi.mocked(invoke).mockResolvedValue("Demande envoyée");
    const result = await addFriend("alice");
    expect(invoke).toHaveBeenCalledWith("add_friend", { name: "alice" });
    expect(result).toBe("Demande envoyée");
  });

  it("propage l'erreur si l'utilisateur n'existe pas", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Utilisateur introuvable"));
    await expect(addFriend("inconnu")).rejects.toThrow("Utilisateur introuvable");
  });
});

describe("listFriends", () => {
  it("invokes 'list_friends' et retourne les amitiés", async () => {
    vi.mocked(invoke).mockResolvedValue([mockFriendship]);
    const result = await listFriends();
    expect(invoke).toHaveBeenCalledWith("list_friends");
    expect(result).toEqual([mockFriendship]);
  });

  it("retourne un tableau vide si aucun ami", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    expect(await listFriends()).toEqual([]);
  });
});

describe("listPendingRequests", () => {
  it("invokes 'list_pending_requests' et retourne les demandes en attente", async () => {
    const pending = [{ ...mockFriendship, status: "pending" }];
    vi.mocked(invoke).mockResolvedValue(pending);
    const result = await listPendingRequests();
    expect(invoke).toHaveBeenCalledWith("list_pending_requests");
    expect(result).toEqual(pending);
  });

  it("retourne un tableau vide si aucune demande", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    expect(await listPendingRequests()).toEqual([]);
  });
});

describe("updateFriendRequest", () => {
  it("invokes 'update_friend_request' avec l'id et l'action accept", async () => {
    vi.mocked(invoke).mockResolvedValue("Demande acceptée");
    const result = await updateFriendRequest("friendship:abc", "accept");
    expect(invoke).toHaveBeenCalledWith("update_friend_request", {
      friendshipId: "friendship:abc",
      action: "accept",
    });
    expect(result).toBe("Demande acceptée");
  });

  it("invokes 'update_friend_request' avec l'action reject", async () => {
    vi.mocked(invoke).mockResolvedValue("Demande refusée");
    await updateFriendRequest("friendship:abc", "reject");
    expect(invoke).toHaveBeenCalledWith("update_friend_request", {
      friendshipId: "friendship:abc",
      action: "reject",
    });
  });
});

describe("deleteFriend", () => {
  it("invokes 'delete_friend' avec le friendshipId", async () => {
    vi.mocked(invoke).mockResolvedValue("Ami supprimé");
    const result = await deleteFriend("friendship:abc");
    expect(invoke).toHaveBeenCalledWith("delete_friend", { friendshipId: "friendship:abc" });
    expect(result).toBe("Ami supprimé");
  });

  it("propage l'erreur si la suppression échoue", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Non autorisé"));
    await expect(deleteFriend("friendship:abc")).rejects.toThrow("Non autorisé");
  });
});
