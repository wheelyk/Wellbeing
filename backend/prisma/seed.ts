// Seeds the small set of system-default symptom categories every user sees in their category
// picker, without anyone having to create "Headache" for themselves. These rows have
// `userId: null` (see the `Category` model's comment in schema.prisma) - that's what makes them
// system-wide rather than owned by a particular account. Symptom unified into Category in Phase
// 17 (see docs/log/17-unify-mood-symptom-habit.md's Task 4 entry) - what used to be seeded as
// `Symptom` rows here is now seeded as `SCALE` categories instead, matching exactly how that
// migration itself mapped each existing symptom onto Category. Seeded at 1-7, not the original
// 1-10 - the unify_scale_categories_to_1_7 migration (see docs/log/21-unify-scale-to-seven.md)
// standardized every built-in scale category onto one common range; a brand-new database must
// seed directly at the current standard, since that migration only ever rescales rows that
// already existed at the time it ran, not ones seeded afterward.
//
// Run directly with `npx prisma db seed`, or automatically after `prisma migrate dev`/`reset`
// (wired up via `migrations.seed` in prisma.config.ts).
// Reuses the same singleton (with its Postgres driver adapter already wired up) that every
// route handler uses, rather than constructing a second PrismaClient here.
import { prisma } from "../src/lib/prisma";
import { CategoryValueType } from "../src/generated/prisma/client";

const SYSTEM_SYMPTOM_CATEGORIES: Array<{ name: string; description?: string }> = [
  { name: "Headache" },
  { name: "Fatigue" },
  { name: "Nausea" },
  { name: "Joint pain" },
  { name: "Brain fog", description: "Difficulty concentrating or thinking clearly" },
  { name: "Insomnia", description: "Trouble falling or staying asleep" },
  { name: "Anxiety" },
  { name: "Depression" },
];

async function main() {
  for (const category of SYSTEM_SYMPTOM_CATEGORIES) {
    // findFirst + create (rather than a unique constraint + upsert) because `name` isn't
    // unique in the schema - a user is free to create their own category with the same name
    // as a system one, so uniqueness can't be enforced at the database level here. Scoping
    // this existence check to userId: null specifically checks "does this system category
    // already exist," which keeps the seed idempotent (safe to re-run) without that database
    // constraint.
    const existing = await prisma.category.findFirst({
      where: { userId: null, name: category.name },
    });
    if (existing) {
      continue;
    }
    await prisma.category.create({
      data: {
        userId: null,
        name: category.name,
        description: category.description,
        valueType: CategoryValueType.SCALE,
        scaleMin: 1,
        scaleMax: 7,
      },
    });
    console.log(`Seeded system category: ${category.name}`);
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
