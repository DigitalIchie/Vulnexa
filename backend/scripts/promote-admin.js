const { PrismaClient } = require('@prisma/client');

async function run() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run user:promote-admin -- user@example.com');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { role: 'admin' },
      select: { id: true, email: true, role: true },
    });
    console.log(`Promoted ${user.email} to role=${user.role}`);
  } catch (error) {
    console.error(`Failed to promote user: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
