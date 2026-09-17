import type { Metadata } from "next";
import { ScheduleCheck } from "@/components/schedule-check";

export const metadata: Metadata = {
  title: "Check your interview schedule · BSSC",
  description:
    "Enter your NIM to check your selected BSSC interview date and time.",
};

export default function ScheduleCheckPage() {
  return <ScheduleCheck />;
}
