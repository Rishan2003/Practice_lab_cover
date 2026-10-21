import { createProxy } from "../../lib/proxy.mjs";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const handleProxy = createProxy({
  upstreamOrigin: process.env.UPSTREAM_ORIGIN || "https://ieltsonlinetests.com",
});

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;
