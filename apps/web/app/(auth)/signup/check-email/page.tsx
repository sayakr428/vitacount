import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to your inbox. Click it to verify your
          account, then come back and log in.
        </p>
      </CardContent>
    </Card>
  );
}
