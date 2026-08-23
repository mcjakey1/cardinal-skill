/** One draft per course. Matches the `cardinal.<name>.v1.<courseId>` family. */
export const chartDraftStorageKey = (courseId: string) => `cardinal.chart-draft.v1.${courseId}`;
