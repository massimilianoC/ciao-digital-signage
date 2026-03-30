import QueuePlusTicketTrackingApp from "@/webapps/queue-plus/src/QueuePlusTicketTrackingApp";

interface Props {
    params: Promise<{ ticketCode: string }>;
}

export default async function QueuePlusTicketPage({ params }: Props) {
    const { ticketCode } = await params;
    return <QueuePlusTicketTrackingApp ticketCode={ticketCode} />;
}
