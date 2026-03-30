import { NextRequest, NextResponse } from "next/server";

import { getQueuePlusDigitalTicketState } from "@/lib/services/queue-plus-ticket.service";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ ticketCode: string }> },
) {
    const { ticketCode } = await params;
    if (!ticketCode) {
        return NextResponse.json({ error: "ticketCode required" }, { status: 400 });
    }

    const state = await getQueuePlusDigitalTicketState(ticketCode);
    if (!state) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json(state);
}
