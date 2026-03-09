import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { personId, eventId } = await req.json();

    if (!personId || !eventId) {
      return NextResponse.json(
        { error: "Missing personId or eventId" },
        { status: 400 }
      );
    }

    // Verify the person exists
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, first_name, last_name")
      .eq("id", personId)
      .single();

    if (personError || !person) {
      return NextResponse.json(
        { error: "Person not found" },
        { status: 404 }
      );
    }

    // Verify the event exists
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, event_date")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404 }
      );
    }

    // Check if already checked in
    const { data: existing } = await supabase
      .from("attendance")
      .select("id")
      .eq("event_id", eventId)
      .eq("person_id", personId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        alreadyCheckedIn: true,
        person: { first_name: person.first_name, last_name: person.last_name },
        event: { name: event.name, event_date: event.event_date },
      });
    }

    // Record attendance
    const { error: insertError } = await supabase
      .from("attendance")
      .insert({ event_id: eventId, person_id: personId });

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to record attendance" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alreadyCheckedIn: false,
      person: { first_name: person.first_name, last_name: person.last_name },
      event: { name: event.name, event_date: event.event_date },
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
