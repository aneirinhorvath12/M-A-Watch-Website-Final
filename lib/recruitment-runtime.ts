import { env } from "cloudflare:workers";
import {
  recruitmentReadiness,
  type RecruitmentReadiness,
  type RecruitmentRuntimeConfig,
  type RecruitmentSettings,
} from "@/lib/recruitment-policy";

export function currentRecruitmentReadiness(
  settings: RecruitmentSettings,
): RecruitmentReadiness {
  return recruitmentReadiness(
    env as unknown as RecruitmentRuntimeConfig,
    settings,
    { allowLoopbackHttp: process.env.NODE_ENV === "development" },
  );
}
