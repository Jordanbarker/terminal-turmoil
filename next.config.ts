import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isProd ? "/terminal-turmoil" : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
