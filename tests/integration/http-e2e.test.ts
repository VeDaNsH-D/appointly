import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { SlotStatus, BookingStatus } from "@prisma/client";

describe("HTTP API Automated E2E Suite (Real PostgreSQL Test DB)", { timeout: 120000 }, () => {
  const app = createApp();

  // Test fixtures tracked for deterministic cleanup
  const createdClinicIds: string[] = [];
  const createdPatientIds: string[] = [];

  // Helper to create clinics in test DB
  async function createTestClinic(name: string) {
    const clinic = await prisma.clinic.create({ data: { name } });
    createdClinicIds.push(clinic.id);
    return clinic;
  }

  // Helper to create patients in test DB
  async function createTestPatient(name: string, email?: string) {
    const patient = await prisma.patient.create({ data: { name, email } });
    createdPatientIds.push(patient.id);
    return patient;
  }

  afterAll(async () => {
    // Safe and deterministic cleanup of all created test entities
    try {
      if (createdClinicIds.length > 0) {
        await prisma.clinic.deleteMany({
          where: { id: { in: createdClinicIds } },
        });
      }
      if (createdPatientIds.length > 0) {
        await prisma.patient.deleteMany({
          where: { id: { in: createdPatientIds } },
        });
      }
    } catch (err) {
      console.warn("Cleanup warning:", err);
    } finally {
      await prisma.$disconnect();
    }
  });

  // 1. Creating a valid slot succeeds with 201
  it("Case 1: Creating a valid slot succeeds with 201", async () => {
    const clinic = await createTestClinic("Case 1 Clinic");
    const startTime = new Date(Date.now() + 3600000 * 24).toISOString();
    const endTime = new Date(Date.now() + 3600000 * 25).toISOString();

    const res = await request(app)
      .post(`/api/clinics/${clinic.id}/slots`)
      .send({ startTime, endTime });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toMatchObject({
      clinicId: clinic.id,
      status: "AVAILABLE",
    });
    expect(res.body.data.id).toBeDefined();

    // Verify persisted record in PostgreSQL
    const slotInDb = await prisma.slot.findUnique({
      where: { id: res.body.data.id },
    });
    expect(slotInDb).not.toBeNull();
    expect(slotInDb?.status).toBe(SlotStatus.AVAILABLE);
  });

  // 2. Invalid timestamps and startTime >= endTime are rejected with 400
  it("Case 2: Invalid timestamps and startTime >= endTime are rejected with 400", async () => {
    const clinic = await createTestClinic("Case 2 Clinic");
    const futureTime = new Date(Date.now() + 3600000 * 10).toISOString();
    const earlierFutureTime = new Date(Date.now() + 3600000 * 5).toISOString();

    // Malformed timestamp format
    const resMalformed = await request(app)
      .post(`/api/clinics/${clinic.id}/slots`)
      .send({
        startTime: "not-a-datetime",
        endTime: futureTime,
      });
    expect(resMalformed.status).toBe(400);
    expect(resMalformed.body.error.code).toBe("VALIDATION_ERROR");

    // startTime > endTime
    const resInverted = await request(app)
      .post(`/api/clinics/${clinic.id}/slots`)
      .send({
        startTime: futureTime,
        endTime: earlierFutureTime,
      });
    expect(resInverted.status).toBe(400);
    expect(resInverted.body.error.code).toBe("VALIDATION_ERROR");

    // startTime === endTime
    const resEqual = await request(app)
      .post(`/api/clinics/${clinic.id}/slots`)
      .send({
        startTime: futureTime,
        endTime: futureTime,
      });
    expect(resEqual.status).toBe(400);
    expect(resEqual.body.error.code).toBe("VALIDATION_ERROR");
  });

  // 3. A past slot is rejected
  it("Case 3: A past slot is rejected", async () => {
    const clinic = await createTestClinic("Case 3 Clinic");
    const pastStart = new Date(Date.now() - 3600000 * 2).toISOString();
    const pastEnd = new Date(Date.now() - 3600000 * 1).toISOString();

    const res = await request(app)
      .post(`/api/clinics/${clinic.id}/slots`)
      .send({
        startTime: pastStart,
        endTime: pastEnd,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body.error.details)).toContain("startTime must be in the future");
  });

  // 4. Listing slots returns only the requested clinic's slots and applies supported filters
  it("Case 4: Listing slots returns only requested clinic's slots and applies filters", async () => {
    const clinicA = await createTestClinic("Clinic A");
    const clinicB = await createTestClinic("Clinic B");

    const t1 = new Date(Date.now() + 3600000 * 30);
    const t2 = new Date(Date.now() + 3600000 * 31);
    const t3 = new Date(Date.now() + 3600000 * 32);
    const t4 = new Date(Date.now() + 3600000 * 33);

    // Clinic A: Slot 1
    const slotA1 = await prisma.slot.create({
      data: {
        clinicId: clinicA.id,
        startTime: t1,
        endTime: t2,
        status: SlotStatus.AVAILABLE,
      },
    });

    // Clinic A: Slot 2 (CANCELLED)
    await prisma.slot.create({
      data: {
        clinicId: clinicA.id,
        startTime: t3,
        endTime: t4,
        status: SlotStatus.CANCELLED,
      },
    });

    // Clinic B: Slot 1 (Should never leak to Clinic A)
    await prisma.slot.create({
      data: {
        clinicId: clinicB.id,
        startTime: t1,
        endTime: t2,
        status: SlotStatus.AVAILABLE,
      },
    });

    // 1. Verify Clinic A list contains only Clinic A's slots
    const resA = await request(app).get(`/api/clinics/${clinicA.id}/slots`);
    expect(resA.status).toBe(200);
    expect(resA.body.data.length).toBe(2);
    resA.body.data.forEach((s: any) => expect(s.clinicId).toBe(clinicA.id));

    // 2. Filter by status=AVAILABLE
    const resAvailable = await request(app)
      .get(`/api/clinics/${clinicA.id}/slots`)
      .query({ status: "AVAILABLE" });
    expect(resAvailable.status).toBe(200);
    expect(resAvailable.body.data.length).toBe(1);
    expect(resAvailable.body.data[0].id).toBe(slotA1.id);
    expect(resAvailable.body.data[0].status).toBe("AVAILABLE");

    // 3. Filter by from and to datetime range
    const resRange = await request(app)
      .get(`/api/clinics/${clinicA.id}/slots`)
      .query({
        from: t1.toISOString(),
        to: t2.toISOString(),
      });
    expect(resRange.status).toBe(200);
    expect(resRange.body.data.length).toBe(1);
    expect(resRange.body.data[0].id).toBe(slotA1.id);
  });

  // 5. Booking an available slot succeeds with 201
  it("Case 5: Booking an available slot succeeds with 201", async () => {
    const clinic = await createTestClinic("Case 5 Clinic");
    const patient = await createTestPatient("Case 5 Patient");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 40),
        endTime: new Date(Date.now() + 3600000 * 41),
        status: SlotStatus.AVAILABLE,
      },
    });

    const res = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toMatchObject({
      slotId: slot.id,
      patientId: patient.id,
      status: "CONFIRMED",
    });

    // Persisted state checks
    const updatedSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(updatedSlot?.status).toBe(SlotStatus.BOOKED);
  });

  // 6. A second booking for an already booked slot returns 409
  it("Case 6: A second booking for an already booked slot returns 409", async () => {
    const clinic = await createTestClinic("Case 6 Clinic");
    const patient1 = await createTestPatient("Patient 1");
    const patient2 = await createTestPatient("Patient 2");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 45),
        endTime: new Date(Date.now() + 3600000 * 46),
        status: SlotStatus.AVAILABLE,
      },
    });

    // First booking succeeds
    const firstRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient1.id });
    expect(firstRes.status).toBe(201);

    // Second booking must be rejected
    const secondRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient2.id });

    expect(secondRes.status).toBe(409);
    expect(secondRes.body.error).toMatchObject({
      code: "SLOT_UNAVAILABLE",
      message: "This slot is already booked.",
    });
  });

  // 7. Booking a cancelled slot returns 409
  it("Case 7: Booking a cancelled slot returns 409", async () => {
    const clinic = await createTestClinic("Case 7 Clinic");
    const patient = await createTestPatient("Patient 7");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 50),
        endTime: new Date(Date.now() + 3600000 * 51),
        status: SlotStatus.CANCELLED,
      },
    });

    const res = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLOT_CANCELLED");
  });

  // 8. Cancelling an active booking succeeds and reopens the slot
  it("Case 8: Cancelling an active booking succeeds and reopens the slot", async () => {
    const clinic = await createTestClinic("Case 8 Clinic");
    const patient = await createTestPatient("Patient 8");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 55),
        endTime: new Date(Date.now() + 3600000 * 56),
        status: SlotStatus.AVAILABLE,
      },
    });

    const bookingRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;

    // Cancel the booking via HTTP DELETE
    const cancelRes = await request(app).delete(`/api/bookings/${bookingId}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe("success");
    expect(cancelRes.body.data.status).toBe("CANCELLED");

    // Persisted state checks: slot reopened to AVAILABLE
    const slotInDb = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(slotInDb?.status).toBe(SlotStatus.AVAILABLE);

    const bookingInDb = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingInDb?.status).toBe(BookingStatus.CANCELLED);
    expect(bookingInDb?.cancelledAt).not.toBeNull();
  });

  // 9. Cancelling the same booking twice returns 409
  it("Case 9: Cancelling the same booking twice returns 409", async () => {
    const clinic = await createTestClinic("Case 9 Clinic");
    const patient = await createTestPatient("Patient 9");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 60),
        endTime: new Date(Date.now() + 3600000 * 61),
        status: SlotStatus.AVAILABLE,
      },
    });

    const bookingRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });
    const bookingId = bookingRes.body.data.id;

    // First cancel succeeds
    const cancel1 = await request(app).delete(`/api/bookings/${bookingId}`);
    expect(cancel1.status).toBe(200);

    // Second cancel returns 409
    const cancel2 = await request(app).delete(`/api/bookings/${bookingId}`);
    expect(cancel2.status).toBe(409);
    expect(cancel2.body.error.code).toBe("BOOKING_ALREADY_CANCELLED");
  });

  // 10. Cancelling a slot with an active booking returns 409
  it("Case 10: Cancelling a slot with an active booking returns 409", async () => {
    const clinic = await createTestClinic("Case 10 Clinic");
    const patient = await createTestPatient("Patient 10");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 65),
        endTime: new Date(Date.now() + 3600000 * 66),
        status: SlotStatus.AVAILABLE,
      },
    });

    // Book slot
    await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });

    // Attempt to cancel slot while actively booked
    const cancelSlotRes = await request(app).delete(`/api/slots/${slot.id}`);
    expect(cancelSlotRes.status).toBe(409);
    expect(cancelSlotRes.body.error.code).toBe("SLOT_HAS_ACTIVE_BOOKING");

    // Verify slot remains BOOKED in database
    const slotInDb = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(slotInDb?.status).toBe(SlotStatus.BOOKED);
  });

  // 11. A nonexistent slot or booking returns 404
  it("Case 11: A nonexistent slot or booking returns 404", async () => {
    const dummyId = "00000000-0000-0000-0000-000000000000";

    const getSlotRes = await request(app).get(`/api/slots/${dummyId}`);
    expect(getSlotRes.status).toBe(404);
    expect(getSlotRes.body.error.code).toBe("NOT_FOUND");

    const deleteSlotRes = await request(app).delete(`/api/slots/${dummyId}`);
    expect(deleteSlotRes.status).toBe(404);
    expect(deleteSlotRes.body.error.code).toBe("NOT_FOUND");

    const deleteBookingRes = await request(app).delete(`/api/bookings/${dummyId}`);
    expect(deleteBookingRes.status).toBe(404);
    expect(deleteBookingRes.body.error.code).toBe("NOT_FOUND");
  });

  // 12. Concurrency: 10 concurrent requests for the same slot
  it("Case 12: 10 concurrent requests for the same slot result in exactly one 201 and nine 409s", async () => {
    const clinic = await createTestClinic("Concurrency Clinic");
    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 70),
        endTime: new Date(Date.now() + 3600000 * 71),
        status: SlotStatus.AVAILABLE,
      },
    });

    // Create 10 distinct patients
    const patientPromises = Array.from({ length: 10 }, (_, i) =>
      createTestPatient(`Concurrent Patient ${i}`)
    );
    const patients = await Promise.all(patientPromises);

    // Fire 10 concurrent HTTP booking requests simultaneously with Promise.all
    const bookingPromises = patients.map((p) =>
      request(app)
        .post(`/api/slots/${slot.id}/bookings`)
        .send({ patientId: p.id })
    );

    const responses = await Promise.all(bookingPromises);

    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);
    const others = responses.filter((r) => r.status !== 201 && r.status !== 409);

    // Strict assertions
    expect(others).toHaveLength(0);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    conflicts.forEach((c) => {
      expect(c.body.error.code).toBe("SLOT_UNAVAILABLE");
    });

    // Persisted state checks in PostgreSQL
    const activeBookings = await prisma.booking.findMany({
      where: {
        slotId: slot.id,
        status: BookingStatus.CONFIRMED,
      },
    });
    expect(activeBookings).toHaveLength(1);

    const slotInDb = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(slotInDb?.status).toBe(SlotStatus.BOOKED);
  });

  // 13. Concurrent cancellation and booking attempts cannot produce an inconsistent state
  it("Case 13: Concurrent cancellation and booking attempts produce a consistent state", async () => {
    const clinic = await createTestClinic("Case 13 Clinic");
    const patientA = await createTestPatient("Patient 13A");
    const patientB = await createTestPatient("Patient 13B");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 80),
        endTime: new Date(Date.now() + 3600000 * 81),
        status: SlotStatus.AVAILABLE,
      },
    });

    // Initial booking with Patient A
    const bookResA = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patientA.id });
    expect(bookResA.status).toBe(201);
    const bookingAId = bookResA.body.data.id;

    // Fire concurrent requests:
    // Request 1: DELETE booking A (attempts to cancel and reopen slot)
    // Request 2: POST booking for patient B (attempts to book slot)
    const cancelPromise = request(app).delete(`/api/bookings/${bookingAId}`);
    const bookBPromise = request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patientB.id });

    const [cancelRes, bookBRes] = await Promise.all([cancelPromise, bookBPromise]);

    // Cancellation of booking A must succeed
    expect(cancelRes.status).toBe(200);

    // Booking B must either succeed with 201 (if executed after cancel) or fail with 409 (if executed before cancel)
    expect([201, 409]).toContain(bookBRes.status);

    // Verify consistency of final persisted database state
    const finalSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    const finalActiveBookings = await prisma.booking.findMany({
      where: { slotId: slot.id, status: BookingStatus.CONFIRMED },
    });

    if (bookBRes.status === 201) {
      // Booking B succeeded: Slot must be BOOKED, exactly 1 active booking (Patient B)
      expect(finalSlot?.status).toBe(SlotStatus.BOOKED);
      expect(finalActiveBookings).toHaveLength(1);
      expect(finalActiveBookings[0].patientId).toBe(patientB.id);
    } else {
      // Booking B was rejected: Slot must be reopened to AVAILABLE, 0 active bookings
      expect(finalSlot?.status).toBe(SlotStatus.AVAILABLE);
      expect(finalActiveBookings).toHaveLength(0);
    }
  });

  // 14. Failed operations do not leave partially updated database records
  it("Case 14: Failed operations do not leave partially updated database records", async () => {
    const clinic = await createTestClinic("Case 14 Clinic");
    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 90),
        endTime: new Date(Date.now() + 3600000 * 91),
        status: SlotStatus.AVAILABLE,
      },
    });

    // Attempt booking with non-existent patient ID
    const dummyPatientId = "00000000-0000-0000-0000-000000000000";
    const failRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: dummyPatientId });

    expect(failRes.status).toBe(404);

    // Assert that failed transaction rolled back completely: slot remains AVAILABLE, no booking created
    const slotAfterFail = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(slotAfterFail?.status).toBe(SlotStatus.AVAILABLE);

    const bookingsAfterFail = await prisma.booking.findMany({
      where: { slotId: slot.id },
    });
    expect(bookingsAfterFail).toHaveLength(0);
  });

  // 15. Regression: Concurrent cancellation of the same booking results in exactly one 200 and one 409
  it("Case 15: Concurrent cancellation of the same booking results in exactly one 200 and one 409", async () => {
    const clinic = await createTestClinic("Case 15 Clinic");
    const patient = await createTestPatient("Patient 15");

    const slot = await prisma.slot.create({
      data: {
        clinicId: clinic.id,
        startTime: new Date(Date.now() + 3600000 * 95),
        endTime: new Date(Date.now() + 3600000 * 96),
        status: SlotStatus.AVAILABLE,
      },
    });

    const bookRes = await request(app)
      .post(`/api/slots/${slot.id}/bookings`)
      .send({ patientId: patient.id });
    expect(bookRes.status).toBe(201);
    const bookingId = bookRes.body.data.id;

    // Fire 2 simultaneous cancel requests for the exact same booking
    const cancelReq1 = request(app).delete(`/api/bookings/${bookingId}`);
    const cancelReq2 = request(app).delete(`/api/bookings/${bookingId}`);

    const [res1, res2] = await Promise.all([cancelReq1, cancelReq2]);

    const successes = [res1, res2].filter((r) => r.status === 200);
    const conflicts = [res1, res2].filter((r) => r.status === 409);

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].body.error.code).toBe("BOOKING_ALREADY_CANCELLED");

    // Final database state check
    const slotInDb = await prisma.slot.findUnique({ where: { id: slot.id } });
    expect(slotInDb?.status).toBe(SlotStatus.AVAILABLE);

    const bookingInDb = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingInDb?.status).toBe(BookingStatus.CANCELLED);
  });
});
