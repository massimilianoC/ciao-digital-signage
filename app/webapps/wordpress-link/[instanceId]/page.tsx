import { WordpressLinkApp } from "@/webapps/wordpress-link/src/WordpressLinkApp";

type PageProps = {
    params: Promise<{ instanceId: string }>;
    searchParams: Promise<{ token?: string }>;
};

export default async function WordpressLinkWebappPage({ params, searchParams }: PageProps) {
    const { instanceId } = await params;
    const { token } = await searchParams;

    if (!token) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white">
                Missing connector access token.
            </div>
        );
    }

    return <WordpressLinkApp instanceId={instanceId} token={token} />;
}
