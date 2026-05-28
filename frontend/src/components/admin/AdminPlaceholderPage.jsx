import { Clock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPlaceholderPage({
  icon: Icon = Clock,
  title,
  description,
  pending,
  items = [],
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Icon className="w-6 h-6 text-primary" />
          {title}
        </h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Backend support pending</CardTitle>
          <CardDescription>{pending}</CardDescription>
        </CardHeader>
        {items.length > 0 && (
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {items.map((item) => (
              <div key={item} className="rounded-lg border px-3 py-2">
                {item}
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
