import { NextRequest, NextResponse } from "next/server";

type XUserResponse = {
  data?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
  errors?: Array<{ detail?: string; message?: string }>;
};

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim().replace(/^@+/, "");

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    return NextResponse.json(
      { error: "Server is missing X_BEARER_TOKEN" },
      { status: 500 },
    );
  }

  const endpoint = `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=profile_image_url`;

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${bearer}`,
      },
      cache: "no-store",
    });

    const body = (await upstream.json()) as XUserResponse;

    if (!upstream.ok || !body.data) {
      const reason = body.errors?.[0]?.detail ?? body.errors?.[0]?.message ?? "X profile lookup failed";
      return NextResponse.json({ error: reason }, { status: upstream.status || 502 });
    }

    return NextResponse.json({
      profile: {
        id: body.data.id,
        name: body.data.name,
        username: body.data.username,
        profile_image_url: body.data.profile_image_url ?? "",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Unexpected X API error: ${String(error)}` },
      { status: 502 },
    );
  }
}
