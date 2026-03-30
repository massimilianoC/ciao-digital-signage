import { GoogleCalendarConnectorForm } from "@/components/cms/GoogleCalendarConnectorForm";
import Link from "next/link";

export default function GoogleCalendarConnectorPage() {
  return (
    <div className="max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-3xl font-bold">New Google Calendar Connector</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crea una webapp calendario hostata nel player Ciao con sorgente Google Calendar via public ICS o Google API key.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link href="/content/google-calendar/sources" className="underline">
            Vai a gestione sorgenti calendario
          </Link>
        </p>
      </div>
      <GoogleCalendarConnectorForm />
    </div>
  );
}