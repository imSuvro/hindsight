import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInButtons } from "@/components/forms/SignInButtons";
import { PageShell } from "@/components/layout/PageShell";
import { getSession } from "@/lib/auth/session";
import { configuredProviders } from "@/lib/schemas/env";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Hindsight with Google or GitHub.",
};

/** Only ever redirect within this app, never to a URL someone put in a query. */
function safeNext(value: string | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function SignInPage(props: PageProps<"/sign-in">) {
  if (await getSession()) redirect("/dashboard");

  const params = await props.searchParams;
  const rawNext = params.next;
  const next = safeNext(typeof rawNext === "string" ? rawNext : undefined);
  const available = configuredProviders();
  const providers = [
    ...(available.google ? (["google"] as const) : []),
    ...(available.github ? (["github"] as const) : []),
  ];

  return (
    <PageShell>
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 className={styles.title}>Start recording what you actually believe</h1>
          <p className={styles.lead}>
            Sign in with an account you already have. There is no password to create,
            because Hindsight never stores one.
          </p>
          <SignInButtons providers={[...providers]} next={next} />
          <p className={styles.fine}>
            Signing in creates a journal that only you can read. What gets stored is
            listed in full on the{" "}
            <a href="https://github.com/imSuvro/hindsight/blob/main/SECURITY.md">
              security page
            </a>
            , and you can delete all of it at any time.
          </p>
        </div>

        <aside className={styles.aside}>
          <h2 className={styles.asideTitle}>Not ready yet?</h2>
          <p className={styles.asideBody}>
            The sample journal shows four years of somebody else&rsquo;s decisions, the
            predictions exactly as they were sealed, and the calibration they add up to.
            Nothing is saved and nothing is asked of you.
          </p>
          <Link href="/demo" className={styles.asideLink}>
            Look around the sample
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
