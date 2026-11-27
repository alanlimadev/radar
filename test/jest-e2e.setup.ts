// Prisma resolves DATABASE_URL when the generated client is imported. This
// default keeps e2e tests self-contained; PrismaService still overrides the
// SQLite file with the temporary RADAR_DATA_DIR created by each suite.
process.env.DATABASE_URL = 'file:./radar.db';
