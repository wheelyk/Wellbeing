// Seeds the small set of system-default symptoms every user sees in their symptom picker,
// without anyone having to create "Headache" for themselves. These rows have `userId: null`
// (see the `Symptom` model's comment in schema.prisma) - that's what makes them system-wide
// rather than owned by a particular account.
//
// Run directly with `npx prisma db seed`, or automatically after `prisma migrate dev`/`reset`
// (wired up via `migrations.seed` in prisma.config.ts).
// Reuses the same singleton (with its Postgres driver adapter already wired up) that every
// route handler uses, rather than constructing a second PrismaClient here.
import { prisma } from "../src/lib/prisma";

const SYSTEM_SYMPTOMS: Array<{ name: string; description?: string }> = [
  { name: "Headache" },
  { name: "Fatigue" },
  { name: "Nausea" },
  { name: "Joint pain" },
  { name: "Brain fog", description: "Difficulty concentrating or thinking clearly" },
  { name: "Insomnia", description: "Trouble falling or staying asleep" },
];

async function main() {
  for (const symptom of SYSTEM_SYMPTOMS) {
    // findFirst + create (rather than a unique constraint + upsert) because `name` isn't
    // unique in the schema - a user is free to create their own symptom with the same name
    // as a system one, so uniqueness can't be enforced at the database level here. Scoping
    // this existence check to userId: null specifically checks "does this system symptom
    // already exist," which keeps the seed idempotent (safe to re-run) without that database
    // constraint.
    const existing = await prisma.symptom.findFirst({
      where: { userId: null, name: symptom.name },
    });
    if (existing) {
      continue;
    }
    await prisma.symptom.create({
      data: { userId: null, name: symptom.name, description: symptom.description },
    });
    console.log(`Seeded system symptom: ${symptom.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
