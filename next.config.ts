import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A Bar Inventory import may be up to 5 MB of CSV text; the default
    // Server Action body limit is 1 MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
