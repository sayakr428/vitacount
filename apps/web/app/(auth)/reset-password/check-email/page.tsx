import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResetPasswordCheckEmailPage() {
  return (
    <Card className="shadow-soft">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          If an account exists for that address, we sent a link to reset your
          password.
        </p>
      </CardContent>
    </Card>
  );
}
