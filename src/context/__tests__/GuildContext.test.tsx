import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuildProvider, useGuild } from "../GuildContext";
import type { Guild } from "../../services/guilds";

const guild: Guild = {
  id: "guild:1",
  name: "Test",
  icon: "",
  owner: "user:me",
  created_at: "2024-01-01T00:00:00Z",
};

function Probe() {
  const { selectedGuild, selectGuild } = useGuild();
  return (
    <>
      <span data-testid="selected">{selectedGuild?.id ?? "none"}</span>
      <button onClick={() => selectGuild(guild)}>select</button>
      <button onClick={() => selectGuild(null)}>clear</button>
    </>
  );
}

describe("GuildContext", () => {
  it("selectedGuild est null par défaut", () => {
    render(<GuildProvider><Probe /></GuildProvider>);
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
  });

  it("selectGuild met à jour selectedGuild", async () => {
    render(<GuildProvider><Probe /></GuildProvider>);
    await userEvent.click(screen.getByRole("button", { name: "select" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("guild:1");
  });

  it("selectGuild(null) remet selectedGuild à null", async () => {
    render(<GuildProvider><Probe /></GuildProvider>);
    await userEvent.click(screen.getByRole("button", { name: "select" }));
    await userEvent.click(screen.getByRole("button", { name: "clear" }));
    expect(screen.getByTestId("selected")).toHaveTextContent("none");
  });
});
