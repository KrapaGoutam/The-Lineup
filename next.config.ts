import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A Bar Inventory import may be up to 5 MB of CSV text, or a 5 MB workbook
    // sent as base64 (about 6.7 MB); the default
    // Server Action body limit is 1 MB.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
