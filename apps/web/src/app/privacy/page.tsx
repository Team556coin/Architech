import { PageShell } from "@/components/AppHeader";

export const metadata = { title: "Privacy - HomeRedo" };

export default function PrivacyPage() {
  return (
    <PageShell>
      <main className="mx-auto max-w-2xl space-y-6 px-5 py-10 text-ink">
        <h1 className="text-3xl font-extrabold text-forest">HomeRedo privacy notice</h1>
        <p className="text-muted">Updated October 17, 2026</p>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Your account</h2>
          <p>HomeRedo uses your name and email address to create and manage your account. When you choose Google sign-in, Google provides your basic profile information and email address. HomeRedo requests only identity information, not access to your Gmail, Drive, contacts, or calendar.</p>
          <p>Sign-in cookies keep you signed in. HomeRedo stores account and sign-in information in its hosted database.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Photos and designs</h2>
          <p>HomeRedo processes photos, drawings, measurements, and instructions you submit to create your designs. Photos and edit instructions are sent through OpenRouter to the configured AI providers, currently Google and OpenAI, when you use AI features. Those services process that content under their own policies.</p>
          <p>Online projects are stored in HomeRedo&apos;s hosted database and private photo storage, provided through Fly.io and Tigris. Device projects also use your browser or app&apos;s local storage. Using AI on a device project still uploads the photo for processing.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Storage and deletion</h2>
          <p>You can delete saved projects from the app. Temporary photos used for device edits are scheduled for cleanup after 48 hours. Clearing browser or app storage removes projects saved only on that device. Hosted service backups may retain earlier copies under the hosting providers&apos; backup retention.</p>
          <p>For account deletion, data access requests, or privacy questions, email <a className="underline" href="mailto:brandonprice@openworth.io">brandonprice@openworth.io</a> from the email address associated with your account.</p>
        </section>
      </main>
    </PageShell>
  );
}
