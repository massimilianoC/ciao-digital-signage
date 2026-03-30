import { GoogleCalendarApp } from "@/webapps/google-calendar/src/GoogleCalendarApp";

type PageProps = {
  params: Promise<{ instanceId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function GoogleCalendarWebAppPage({ params, searchParams }: PageProps) {
  const { instanceId } = await params;
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
        Missing connector access token.
      </div>
    );
  }

  return <GoogleCalendarApp instanceId={instanceId} token={token} />;
}