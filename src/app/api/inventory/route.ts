import { NextResponse } from "next/server";
import {
  API_INVENTORY,
  API_INVENTORY_STATS,
  API_TARGETS,
} from "../../../../config/targets";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    stats: API_INVENTORY_STATS,
    smokeCount: API_TARGETS.length,
    routes: API_INVENTORY,
  });
}
