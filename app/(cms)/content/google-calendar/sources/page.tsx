import { GoogleCalendarSourcesManager } from "@/components/cms/GoogleCalendarSourcesManager";

export default function GoogleCalendarSourcesPage() {
  return (
    <div className="max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-3xl font-bold">Google Calendar Sources</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gestisci le sorgenti calendario tenant-scoped per il configuratore Google Calendar.
        </p>
      </div>
      <GoogleCalendarSourcesManager />
    </div>
  );
}
