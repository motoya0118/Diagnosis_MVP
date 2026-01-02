export type MasterPayload<T = any> = {
  key: string;
  etag: string;
  schema: { name: string; db_type: string; nullable: boolean }[];
  rows: T[];
};

// Minimal static fallback. Keep empty rows so SSR won't crash.
export const STATIC_MASTERS: Record<string, MasterPayload> = {
  // Example shape for mst_ai_jobs
  mst_ai_jobs: {
    key: 'mst_ai_jobs',
    etag: 's-empty',
    schema: [
      { name: 'id', db_type: 'BIGINT', nullable: false },
      { name: 'name', db_type: 'VARCHAR(191)', nullable: false },
      { name: 'category', db_type: 'VARCHAR(191)', nullable: true },
      { name: 'role_summary', db_type: 'TEXT', nullable: false },
      { name: 'main_role', db_type: 'TEXT', nullable: true },
      { name: 'collaboration_style', db_type: 'TEXT', nullable: true },
      { name: 'strength_areas', db_type: 'TEXT', nullable: true },
      { name: 'description', db_type: 'TEXT', nullable: false },
      { name: 'avg_salary_jpy', db_type: 'VARCHAR(64)', nullable: true },
      { name: 'target_phase', db_type: 'TEXT', nullable: true },
      { name: 'core_skills', db_type: 'TEXT', nullable: true },
      { name: 'deliverables', db_type: 'TEXT', nullable: true },
      { name: 'pathway_detail', db_type: 'TEXT', nullable: true },
      { name: 'ai_tools', db_type: 'TEXT', nullable: true },
      { name: 'advice', db_type: 'TEXT', nullable: true },
      { name: 'sort_order', db_type: 'INT', nullable: false },
      { name: 'is_active', db_type: 'TINYINT(1)', nullable: false },
    ],
    rows: [],
  },
};
