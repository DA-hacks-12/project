import { Suspense } from "react";
import { Login } from "@/shell/Login";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
