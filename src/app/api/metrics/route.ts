import { NextResponse } from "next/server";
import { env } from "~/env";
import { register } from "~/server/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const token = req.headers.get("authorization");

    if (env.METRICS_TOKEN && token !== `Bearer ${env.METRICS_TOKEN}`) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const metrics = await register.metrics();
    return new NextResponse(metrics, {
        headers: { "Content-Type": register.contentType },
    });
}