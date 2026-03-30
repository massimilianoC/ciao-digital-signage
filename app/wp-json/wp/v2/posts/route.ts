import { NextResponse } from "next/server";

const FIXTURE_POSTS = [
    {
        id: 101,
        date: "2026-03-01T09:00:00",
        link: "https://fixture.local/post-101",
        title: { rendered: "Fixture WordPress Post 101" },
        excerpt: { rendered: "Anteprima fixture del post 101" },
        _embedded: {
            "wp:featuredmedia": [{ source_url: "https://picsum.photos/seed/wp101/800/450" }],
            "wp:term": [[{ name: "News" }, { name: "Fixture" }]],
        },
    },
    {
        id: 102,
        date: "2026-03-02T11:30:00",
        link: "https://fixture.local/post-102",
        title: { rendered: "Fixture WordPress Post 102" },
        excerpt: { rendered: "Anteprima fixture del post 102" },
        _embedded: {
            "wp:featuredmedia": [{ source_url: "https://picsum.photos/seed/wp102/800/450" }],
            "wp:term": [[{ name: "Updates" }, { name: "Product" }]],
        },
    },
];

export async function GET() {
    return NextResponse.json(FIXTURE_POSTS);
}
