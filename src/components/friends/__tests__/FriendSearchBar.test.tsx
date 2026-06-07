import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FriendSearchBar from "../FriendSearchBar";

describe("FriendSearchBar", () => {
  it("affiche la valeur courante", () => {
    render(<FriendSearchBar value="alice" onChange={vi.fn()} />);
    expect((screen.getByPlaceholderText("Rechercher") as HTMLInputElement).value).toBe("alice");
  });

  it("appelle onChange quand l'utilisateur tape", async () => {
    const onChange = vi.fn();
    render(<FriendSearchBar value="" onChange={onChange} />);
    await userEvent.type(screen.getByPlaceholderText("Rechercher"), "bob");
    expect(onChange).toHaveBeenCalled();
  });
});
