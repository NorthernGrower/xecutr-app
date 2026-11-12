import { createFileRoute } from "@tanstack/react-router";
import { MfaPage } from "@/components/auth/MfaPage";

export const Route = createFileRoute("/mfa")({ ssr: false, component: MfaPage });