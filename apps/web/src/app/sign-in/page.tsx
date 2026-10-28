import { Suspense } from "react";
import { PageShell } from "@/components/AppHeader";
import { AuthForm } from "@/components/AuthForm";
import { env } from "@/server/env";

export const metadata = { title: "Sign in - HomeRedo" };
export const dynamic = "force-dynamic";

export default function SignInPage() {
  const e = env();
  return (
    <PageShell>
      <main className="mx-auto max-w-md px-5 py-10">
        <Suspense>
          <AuthForm googleEnabled={Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET)} />
        </Suspense>
      </main>
    </PageShell>
  );
}
