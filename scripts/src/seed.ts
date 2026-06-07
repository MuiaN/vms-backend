import bcrypt from "bcryptjs";
import {
  db,
  usersTable,
  distributorsTable,
  vehiclesTable,
  statusHistoryTable,
  ordersTable,
  invoicesTable,
  vehiclePricingTable,
} from "@workspace/db";

async function seed() {
  console.log("Seeding database...");

  await db.insert(distributorsTable).values({ name: "AutoDrive Europe", contactInfo: "contact@autodrive.eu" }).onConflictDoNothing();
  await db.insert(distributorsTable).values({ name: "Pacific Motors", contactInfo: "hello@pacificmotors.com" }).onConflictDoNothing();

  const allDist = await db.select().from(distributorsTable);
  const autoDrive = allDist.find((d) => d.name === "AutoDrive Europe")!;
  const pacific = allDist.find((d) => d.name === "Pacific Motors")!;
  console.log("Distributors ready");

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const userSeeds = [
    { email: "manufacturer@test.com", passwordHash: hash("password"), role: "manufacturer", distributorId: null },
    { email: "distributor1@test.com", passwordHash: hash("password"), role: "distributor", distributorId: autoDrive.id },
    { email: "distributor2@test.com", passwordHash: hash("password"), role: "distributor", distributorId: pacific.id },
  ];
  for (const u of userSeeds) {
    await db.insert(usersTable).values(u as any).onConflictDoNothing();
  }
  const allUsers = await db.select().from(usersTable);
  const mfr = allUsers.find((u) => u.role === "manufacturer")!;
  console.log("Users ready");

  const vehicleSeeds = [
    { vin: "1HGBH41JXMN109186", make: "Toyota",     model: "Camry",     trim: "XSE",          colour: "Pearl White",      engine: "2.5L V4",               status: "Production",         currentDistributorId: null },
    { vin: "2T1BURHE0JC025451", make: "Honda",      model: "Civic",     trim: "Sport",        colour: "Sonic Grey",       engine: "1.5L Turbo",            status: "Quality Check",      currentDistributorId: null },
    { vin: "3VWFE21C04M000001", make: "BMW",        model: "3 Series",  trim: "M Sport",      colour: "Alpine White",     engine: "2.0L TwinPower Turbo",  status: "Ready for Dispatch", currentDistributorId: null },
    { vin: "4T1B11HK0JU001234", make: "Mercedes",   model: "C-Class",   trim: "AMG Line",     colour: "Obsidian Black",   engine: "1.5L EQ Boost",         status: "Dispatched",         currentDistributorId: autoDrive.id },
    { vin: "5YJ3E1EA1JF006789", make: "Tesla",      model: "Model 3",   trim: "Long Range",   colour: "Midnight Silver",  engine: "Dual Motor Electric",   status: "Dispatched",         currentDistributorId: autoDrive.id },
    { vin: "1G1ZT53816F109148", make: "Audi",       model: "A4",        trim: "S Line",       colour: "Mythos Black",     engine: "2.0L TFSI",             status: "Dispatched",         currentDistributorId: pacific.id },
    { vin: "JN8AZ2NE5D9010203", make: "Volkswagen", model: "Golf",      trim: "GTI",          colour: "Tornado Red",      engine: "2.0L TSI",              status: "Quality Check",      currentDistributorId: null },
    { vin: "WAUEFAFL4CA018765", make: "Ford",       model: "Mustang",   trim: "GT Premium",   colour: "Race Red",         engine: "5.0L V8",               status: "Ready for Dispatch", currentDistributorId: null },
    { vin: "1FTFW1ET5DFC10312", make: "Porsche",    model: "911",       trim: "Carrera S",    colour: "Guards Red",       engine: "3.0L Flat-6 Turbo",     status: "Dispatched",         currentDistributorId: pacific.id },
    { vin: "SALGS2FV5FA123456", make: "Land Rover", model: "Discovery", trim: "HSE Luxury",   colour: "Carpathian Grey",  engine: "3.0L D300 MHEV",        status: "Production",         currentDistributorId: null },
  ];

  for (const v of vehicleSeeds) {
    const existing = await db.select().from(vehiclesTable);
    if (!existing.find((r) => r.vin === v.vin)) {
      const [vehicle] = await db.insert(vehiclesTable).values(v as any).returning();
      await db.insert(statusHistoryTable).values({ vehicleId: vehicle.id, oldStatus: null, newStatus: v.status, changedBy: mfr.id });
    }
  }
  console.log("Vehicles ready");

  const allVehicles = await db.select().from(vehiclesTable);
  const autoDriveVehicles = allVehicles.filter((v) => v.currentDistributorId === autoDrive.id);
  const pacificVehicles   = allVehicles.filter((v) => v.currentDistributorId === pacific.id);

  for (const v of autoDriveVehicles) {
    const exists = await db.select().from(ordersTable).then((rows) => rows.find((r) => r.vehicleId === v.id));
    if (!exists) {
      await db.insert(ordersTable).values({
        vehicleId: v.id,
        distributorId: autoDrive.id,
        customerName: "James Mitchell",
        customerContact: "james.mitchell@email.com",
        orderStatus: "Pending",
      });
    }
  }
  for (const v of pacificVehicles) {
    const exists = await db.select().from(ordersTable).then((rows) => rows.find((r) => r.vehicleId === v.id));
    if (!exists) {
      await db.insert(ordersTable).values({
        vehicleId: v.id,
        distributorId: pacific.id,
        customerName: "Sarah Chen",
        customerContact: "sarah.chen@email.com",
        orderStatus: "Confirmed",
      });
    }
  }
  console.log("Orders ready");

  // Vehicle-specific pricing (realistic per-model prices)
  const vehiclePrices: Record<string, string> = {
    "4T1B11HK0JU001234": "52500.00",  // Mercedes C-Class AMG Line
    "5YJ3E1EA1JF006789": "65000.00",  // Tesla Model 3 Long Range
    "1G1ZT53816F109148": "48500.00",  // Audi A4 S Line
    "1FTFW1ET5DFC10312": "125000.00", // Porsche 911 Carrera S
  };

  // Clear and re-insert pricing so amounts stay correct on re-seed
  await db.delete(vehiclePricingTable);
  for (const v of [...autoDriveVehicles, ...pacificVehicles]) {
    const price = vehiclePrices[v.vin] ?? "42750.00";
    await db.insert(vehiclePricingTable).values({
      vehicleId: v.id,
      distributorId: v.currentDistributorId!,
      price,
      effectiveDate: "2026-01-01",
    });
  }
  console.log("Pricing ready");

  // Invoices: manufacturer billing distributors for dispatched vehicles
  const mercedes = allVehicles.find((v) => v.vin === "4T1B11HK0JU001234")!;
  const tesla     = allVehicles.find((v) => v.vin === "5YJ3E1EA1JF006789")!;
  const audi      = allVehicles.find((v) => v.vin === "1G1ZT53816F109148")!;
  const porsche   = allVehicles.find((v) => v.vin === "1FTFW1ET5DFC10312")!;

  const invoiceSeeds = [
    {
      distributorId: autoDrive.id,
      vehicleId: mercedes.id,
      amount: "52500.00",
      status: "paid",
      dueDate: "2026-04-01",
      description: `Vehicle sale: Mercedes C-Class AMG Line — VIN ${mercedes.vin}`,
    },
    {
      distributorId: autoDrive.id,
      vehicleId: tesla.id,
      amount: "65000.00",
      status: "unpaid",
      dueDate: "2026-06-15",
      description: `Vehicle sale: Tesla Model 3 Long Range — VIN ${tesla.vin}`,
    },
    {
      distributorId: pacific.id,
      vehicleId: audi.id,
      amount: "48500.00",
      status: "paid",
      dueDate: "2026-04-01",
      description: `Vehicle sale: Audi A4 S Line — VIN ${audi.vin}`,
    },
    {
      distributorId: pacific.id,
      vehicleId: porsche.id,
      amount: "125000.00",
      status: "unpaid",
      dueDate: "2026-06-30",
      description: `Vehicle sale: Porsche 911 Carrera S — VIN ${porsche.vin}`,
    },
  ];

  for (const inv of invoiceSeeds) {
    await db.insert(invoicesTable).values(inv as any);
  }
  console.log("Invoices ready");

  console.log("\n✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
