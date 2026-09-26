// Public Academic service API. Keep existing callers stable while implementations
// are organized by responsibility. Internal modules import each other directly.

export {
  listAttendanceByStudent,
  listCompletedTasksByStudent
} from "./academic/history.js";

export {
  addStudent,
  getStudent,
  archiveStudentCase,
  findStudentByNameHomeroom,
  upsertStudent,
  bulkImportStudents,
  previewStudentRosterImport,
  importStudentRoster,
  updateStudentRecord,
  maybeAutoArchiveStudent
} from "./academic/students.js";

export {
  addMinutes,
  markServedToday,
  recordTodayAcademicAttendance,
  unmarkServedToday,
  undoTodayAcademicAttendance
} from "./academic/attendance.js";

export {
  ACADEMIC_SESSION_LANES,
  academicLaneDocId,
  addToDeck,
  removeFromDeck,
  listenTodayAcademicSession,
  startTodayAcademicSession,
  addStudentToTodayAcademicSession,
  recordTodayAcademicSessionOutcome,
  removeStudentFromTodayAcademicSession,
  endTodayAcademicSession
} from "./academic/sessions.js";

export {
  archiveCompletedTask,
  dismissStudentFromAR,
  deleteTaskHard,
  updateTaskState,
  MAX_TASK_BATCH_SIZE,
  listenPendingAcademicStudentCount,
  addTask,
  listenActiveTasks,
  setTaskStatus,
  completeTask,
  cancelTask,
  bumpTaskState,
  addTasks
} from "./academic/tasks.js";
