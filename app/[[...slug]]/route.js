import { createProxy } from "../../lib/proxy.mjs";

// Use Node's server-side HTTP implementation on Vercel.
export const runtime = "nodejs";
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
