import Link from "next/link";

import { DropUploader } from "@/components/cms/DropUploader";
import { Button } from "@/components/ui/button";

export default function UploadContentPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold">Upload Content</h1>
          <p className="text-sm text-muted-foreground">
            Add images or videos to your content library using drag and drop.
          </p>
        </div>
        <Link href="/content/google-calendar/new">
          <Button variant="outline">New Google Calendar Connector</Button>
        </Link>
        <Link href="/content/wordpress-link/new">
          <Button variant="outline">New WordpressLink Connector</Button>
        </Link>
      </div>
      <DropUploader />
    </div>
  );
}
