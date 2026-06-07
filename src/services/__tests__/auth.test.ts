import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, signup, getCurrentUser, logout } from "../auth";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockUser = {
  id: "user:abc",
  name: "alice",
  display_name: "Alice",
  email: "alice@example.com",
  profile_picture: "",
  status: "Online" as const,
  created_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => vi.clearAllMocks());

describe("login", () => {
  it("invokes 'login' command with email and password", async () => {
    vi.mocked(invoke).mockResolvedValue(mockUser);
    const result = await login("alice@example.com", "secret");
    expect(invoke).toHaveBeenCalledWith("login", { email: "alice@example.com", password: "secret" });
    expect(result).toEqual(mockUser);
  });

  it("propagates error from Rust command", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Invalid credentials"));
    await expect(login("bad@example.com", "wrong")).rejects.toThrow("Invalid credentials");
  });
});

describe("signup", () => {
  it("invokes 'signup' command with name, email and password", async () => {
    vi.mocked(invoke).mockResolvedValue(mockUser);
    const result = await signup("alice", "alice@example.com", "secret");
    expect(invoke).toHaveBeenCalledWith("signup", {
      name: "alice",
      email: "alice@example.com",
      password: "secret",
    });
    expect(result).toEqual(mockUser);
  });

  it("propagates error from Rust command", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("Email already taken"));
    await expect(signup("alice", "alice@example.com", "secret")).rejects.toThrow("Email already taken");
  });
});

describe("getCurrentUser", () => {
  it("invokes 'get_current_user' and returns user when session exists", async () => {
    vi.mocked(invoke).mockResolvedValue(mockUser);
    const result = await getCurrentUser();
    expect(invoke).toHaveBeenCalledWith("get_current_user");
    expect(result).toEqual(mockUser);
  });

  it("returns null when no session", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    const result = await getCurrentUser();
    expect(result).toBeNull();
  });
});

describe("logout", () => {
  it("invokes 'logout' command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await logout();
    expect(invoke).toHaveBeenCalledWith("logout");
  });
});
