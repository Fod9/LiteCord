import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../AuthContext";

vi.mock("../../services/auth", () => ({
  login: vi.fn(),
  signup: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

import { login, signup, getCurrentUser, logout } from "../../services/auth";

const mockUser = {
  id: "user:abc",
  name: "alice",
  display_name: "Alice",
  email: "alice@example.com",
  profile_picture: "",
  status: "Online" as const,
  created_at: "2024-01-01T00:00:00Z",
};

function AuthConsumer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{user ? `logged in as ${user.name}` : "not logged in"}</p>;
}

function LoginButton({ onError }: { onError?: (e: Error) => void }) {
  const { login: doLogin } = useAuth();
  return (
    <button onClick={() => doLogin("a@b.com", "pw").catch((e) => onError?.(e))}>
      login
    </button>
  );
}

function LogoutButton() {
  const { logout: doLogout } = useAuth();
  return <button onClick={() => doLogout()}>logout</button>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  vi.mocked(logout).mockResolvedValue(undefined);
});

describe("AuthProvider — initial state", () => {
  it("shows not logged in when Rust returns null", async () => {
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("not logged in")).toBeInTheDocument());
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });

  it("restores session when Rust returns a user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("logged in as alice")).toBeInTheDocument());
  });

  it("stays logged out when getCurrentUser throws", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("IPC error"));
    render(<AuthProvider><AuthConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("not logged in")).toBeInTheDocument());
  });
});

describe("AuthProvider — login", () => {
  it("updates user state on successful login", async () => {
    vi.mocked(login).mockResolvedValue(mockUser);

    render(<AuthProvider><AuthConsumer /><LoginButton /></AuthProvider>);
    await waitFor(() => screen.getByText("not logged in"));
    await act(() => userEvent.click(screen.getByText("login")));
    await waitFor(() => expect(screen.getByText("logged in as alice")).toBeInTheDocument());
  });

  it("does not update state on failed login", async () => {
    vi.mocked(login).mockRejectedValue(new Error("Invalid credentials"));

    let caughtError: Error | null = null;
    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginButton onError={(e) => { caughtError = e; }} />
      </AuthProvider>
    );
    await waitFor(() => screen.getByText("not logged in"));
    await act(() => userEvent.click(screen.getByText("login")));

    expect((caughtError as unknown as Error).message).toBe("Invalid credentials");
    expect(screen.getByText("not logged in")).toBeInTheDocument();
  });
});

describe("AuthProvider — logout", () => {
  it("clears user and calls Rust logout command", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);

    render(<AuthProvider><AuthConsumer /><LogoutButton /></AuthProvider>);
    await waitFor(() => screen.getByText("logged in as alice"));

    await act(() => userEvent.click(screen.getByText("logout")));
    expect(screen.getByText("not logged in")).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });
});
