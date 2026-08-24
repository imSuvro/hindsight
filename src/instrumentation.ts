/**
 * Runs once when the server starts.
 *
 * This used to throw on a missing variable. It now reports instead, because
 * refusing to boot is the wrong response to an *un*-configured deployment —
 * the landing page and the sample journal need nothing, and someone evaluating
 * the project should be able to see them. A variable that is present but
 * malformed still fails hard, inside `env()`.
 *
 * What is printed is a one-screen summary of which features this process can
 * actually perform, so a deployment that is quietly missing its database says
 * so in the first line of its logs rather than on somebody's first sign-in.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { features, siteUrl } = await import("@/lib/schemas/env");
  const state = features();
  const mark = (ready: boolean) => (ready ? "ready" : "not configured");

  const lines = [
    `Hindsight starting at ${siteUrl()}`,
    `  database          ${mark(state.database)}`,
    `  sign-in           ${mark(state.auth)}`,
    `  providers         ${
      [state.providers.google && "google", state.providers.github && "github"]
        .filter(Boolean)
        .join(", ") || "none"
    }`,
    `  scheduled jobs    ${mark(state.scheduledJobs)}`,
    `  email             ${state.email === "brevo" ? "brevo" : "log only"}`,
  ];

  if (!state.database) {
    lines.push(
      "",
      "  Running without a journal database. The landing page, the sample",
      "  journal and the methodology page work; anything personal does not.",
      "  See docs/deploying.md to finish the setup.",
    );
  }

  console.warn(lines.join("\n"));
}
