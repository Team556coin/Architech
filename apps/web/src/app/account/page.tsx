"use client";

import { Button, Segmented } from "@architech/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageShell } from "@/components/AppHeader";
import { useSession, useToast } from "@/components/Providers";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export default function AccountPage() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!loading && !me?.user) router.replace("/sign-in?next=/account");
  }, [loading, me, router]);

  if (!me?.user) return <PageShell>{null}</PageShell>;
  return (
    <PageShell>
      <main className="mx-auto max-w-lg space-y-6 px-5 py-8">
        <h1 className="text-3xl font-extrabold text-forest">Account</h1>
        <section className="rounded-3xl border border-line bg-white p-5">
          <p className="text-lg font-bold">{me.user.name}</p>
          <p className="text-muted">{me.user.email}</p>
          <p className="mt-4 font-semibold">
            {me.credits} free edit{me.credits === 1 ? "" : "s"} left
          </p>
          <p className="text-muted">
            {me.serverProjects} of {me.maxServerProjects} projects saved online
          </p>
        </section>
        <section className="rounded-3xl border border-line bg-white p-5">
          <p className="mb-3 font-bold">Measurements</p>
          <Segmented
            label="Units"
            value={me.units ?? "imperial"}
            onChange={async (u) => {
              await api.setUnits(u);
              await refresh();
              toast(u === "metric" ? "Using meters" : "Using feet and inches", "success");
            }}
            options={[
              { value: "imperial", label: "ft / in" },
              { value: "metric", label: "meters" },
            ]}
          />
        </section>
        <Button
          variant="outline"
          size="lg"
          block
          onClick={async () => {
            await authClient.signOut();
            await refresh();
            router.push("/");
          }}
        >
          Sign out
        </Button>
      </main>
    </PageShell>
  );
}
