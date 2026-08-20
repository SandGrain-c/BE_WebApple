import prisma from "../src/utils/prisma";
import { seedDemoAccounts } from "./demo-account-seed";
import { printDemoCommerceSummary, seedDemoCommerce } from "./demo-commerce-seed";

async function main() {
  await seedDemoAccounts(prisma);
  const summary = await seedDemoCommerce(prisma);
  printDemoCommerceSummary(summary);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
