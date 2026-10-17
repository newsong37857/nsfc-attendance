import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";
import { scheduleMembershipSync } from "@/lib/membership-sync";

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminClient();
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

    // Atomic upsert — avoids race condition between check and insert.
    // Relies on UNIQUE(event_id, person_id) constraint on attendance table.
    // ignoreDuplicates: true means a conflict returns success with no row change.
    const { data: upserted, error: upsertError } = await supabase
      .from("attendance")
      .upsert(
        { event_id: eventId, person_id: personId },
        { onConflict: "event_id,person_id", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (upsertError) {
      return NextResponse.json(
        { error: "Failed to record attendance" },
        { status: 500 }
      );
    }

    // If upserted is null, the row already existed (duplicate was ignored)
    const alreadyCheckedIn = upserted === null;

    // Let the CRM's membership engine see the new attendance row (runs after the response).
    scheduleMembershipSync([personId]);

    return NextResponse.json({
      success: true,
      alreadyCheckedIn,
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
