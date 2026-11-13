import { createFileRoute } from "@tanstack/react-router";
import { ConsentPage } from "@/components/auth/ConsentPage";

export const Route = createFileRoute("/oauth/consent")({ ssr: false, component: ConsentPage });