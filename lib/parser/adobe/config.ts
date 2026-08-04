export type AdobePdfServicesRegion = "eu" | "us";

export type AdobeParserEnv = {
  ADOBE_PDF_SERVICES_CLIENT_ID?: string;
  ADOBE_PDF_SERVICES_CLIENT_SECRET?: string;
  ADOBE_PDF_SERVICES_REGION?: string;
};

export type AdobeParserConfig = {
  clientId: string;
  clientSecret: string;
  region: AdobePdfServicesRegion;
  tokenUrl: "https://pdf-services.adobe.io/token";
  baseUrl: string;
  storageHosts: readonly string[];
};

const ADOBE_TOKEN_URL = "https://pdf-services.adobe.io/token" as const;

const REGION_CONFIG: Record<
  AdobePdfServicesRegion,
  Pick<AdobeParserConfig, "baseUrl" | "storageHosts">
> = {
  eu: {
    baseUrl: "https://pdf-services-ew1.adobe.io",
    storageHosts: ["dcplatformstorageservice-prod-eu-west-1.s3.amazonaws.com"],
  },
  us: {
    baseUrl: "https://pdf-services-ue1.adobe.io",
    storageHosts: [
      "dcplatformstorageservice-prod-us-east-1.s3-accelerate.amazonaws.com",
    ],
  },
};

/**
 * Resolve Adobe credentials only when the processing region was explicitly
 * selected. There is deliberately no implicit US default for private reports.
 */
export function resolveAdobeParserConfig(
  runtime: AdobeParserEnv,
): AdobeParserConfig | null {
  const clientId = runtime.ADOBE_PDF_SERVICES_CLIENT_ID?.trim();
  const clientSecret = runtime.ADOBE_PDF_SERVICES_CLIENT_SECRET?.trim();
  const region = runtime.ADOBE_PDF_SERVICES_REGION?.trim().toLowerCase();
  if (
    !clientId ||
    !clientSecret ||
    (region !== "eu" && region !== "us")
  ) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    region,
    tokenUrl: ADOBE_TOKEN_URL,
    ...REGION_CONFIG[region],
  };
}

export function isTrustedAdobeApiUrl(
  value: string,
  config: AdobeParserConfig,
): boolean {
  try {
    const candidate = new URL(value, config.baseUrl);
    const base = new URL(config.baseUrl);
    return (
      candidate.protocol === "https:" &&
      candidate.origin === base.origin &&
      candidate.username === "" &&
      candidate.password === "" &&
      candidate.pathname.startsWith("/operation/extractpdf/") &&
      candidate.pathname.endsWith("/status")
    );
  } catch {
    return false;
  }
}

export function isTrustedAdobeStorageUrl(
  value: string,
  config: AdobeParserConfig,
): boolean {
  try {
    const candidate = new URL(value);
    return (
      candidate.protocol === "https:" &&
      candidate.username === "" &&
      candidate.password === "" &&
      (candidate.port === "" || candidate.port === "443") &&
      config.storageHosts.includes(candidate.hostname)
    );
  } catch {
    return false;
  }
}
